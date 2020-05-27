'use strict';
const config = require('./config');

const logger = require('winston');
// configure default logger
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    level: config.loggerLevel,
    colorize: true
});

const i18next = require('i18next');
const i18nMiddleware = require('i18next-express-middleware');
const { LanguageDetector } = require('i18next-express-middleware');
const i18nFS = require('i18next-node-fs-backend');
const i18nSprintf = require('i18next-sprintf-postprocessor');
const Intl = require('intl');
const express = require('express');
const favicon = require('serve-favicon');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const session = require('express-session');

const errorHandler = require('errorhandler');
const passport = require('passport');
const expressWinston = require('express-winston');
const path = require('path');
const moment = require('moment');
const routes = require('./backend/routes');
const db = require('./backend/models/db');
const ejsHelpers = require('./backend/pages/ejshelpers');

const dist_directory = path.join(__dirname, 'dist');

// Init locale
i18next.use(LanguageDetector)
    .use(i18nFS)
    .use(i18nSprintf)
    .init({
        debug: false,
        fallbackLng: 'en',
        pluralSeparator: '_',
        keySeparator: '::',
        nsSeparator: ':::',
        detection: {
            order: [ /*'path', 'session', 'querystring',*/ 'cookie', 'header'],
            lookupCookie: 'locaI18next',
            cookieDomain: 'loca',
            caches: ['cookie']
        },
        backend: {
            loadPath: path.join(dist_directory, 'locales', '{{lng}}.json')
        }
    });

// Init express
const app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(session({
    secret: 'loca-secret',
    rolling: true,
    cookie: {
        //      min  s     ms
        maxAge: 10 * 60 * 1000 // 10 minutes
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(i18nMiddleware.handle(i18next));
app.use((req, res, next) => {
    app.locals.Intl = {
        NumberFormat: new Intl.NumberFormat(req.language, { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        NumberFormatPercent: new Intl.NumberFormat(req.language, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        NumberFormatCurrency: new Intl.NumberFormat(req.language, { style: 'currency', currency: req.t('__currency_code') })
    };
    const splitedLanguage = req.language.split('-');
    moment.locale(splitedLanguage[0]);
    next();
});
// Icon / static files
app.use(favicon(path.join(dist_directory, 'images', 'favicon.png'), {
    maxAge: 2592000000
}));
app.use('/node_modules', express.static(path.join(__dirname, '/node_modules')));
app.use('/public', express.static(dist_directory));
app.use('/public/image', express.static(path.join(dist_directory, 'images')));
app.use('/public/images', express.static(path.join(dist_directory, 'images')));
app.use('/public/fonts', express.static(path.join(__dirname, '/node_modules/bootstrap/fonts')));
app.use('/public/pdf', express.static(path.join(dist_directory, 'pdf')));
app.use('/robots.txt', express.static(path.join(dist_directory, 'robots.txt')));
app.use('/sitemap.xml', express.static(path.join(dist_directory, 'sitemap.xml')));

app.set('views', path.join(__dirname, 'backend', 'pages'));
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

// Express log through out winston
app.use(expressWinston.logger({
    transports: [
        new logger.transports.Console({
            json: false,
            colorize: true
        })
    ],
    meta: false, // optional: control whether you want to log the meta data about the request (default to true)
    msg: String, //'HTTP {{req.method}} {{req.url}}', // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}"
    expressFormat: true, // Use the default Express/morgan request formatting, with the same colors. Enabling this will override any msg and colorStatus if true. Will only output colors on transports with colorize set to true
    colorStatus: true // Color the status code, using the Express/morgan color palette (default green, 3XX cyan, 4XX yellow, 5XX red). Will not be recognized if expressFormat is true
    //ignoreRoute: function( /*req, res*/ ) {
    //    return false;
    //} // optional: allows to skip some log messages based on request and/or response
}));
app.use(expressWinston.errorLogger({
    transports: [
        new logger.transports.Console({
            json: false,
            colorize: true
        })
    ]
}));

// Init routes
routes.forEach(route => {
    app.use(route());
});

// Start web app
if (!config.productive) {
    // Create new middleware to handle errors and respond with content negotiation.
    // This middleware is only intended to be used in a development environment,
    // as the full error stack traces will be sent back to the client when an error occurs.
    app.use(errorHandler());
}

// init ejs helpers
app.locals = {
    ...app.locals,
    ...ejsHelpers
};

db.init()
    .then(db.exists)
    .then((isDbExists) => {
        if (config.restoreDatabase) {
            require('./scripts/mongorestore');
            logger.debug('database restored');
        }

        const appDebugHttPort = 9091;
        const http_port = config.productive ? config.appHttpPort : appDebugHttPort;
        app.listen(http_port, () => {
            logger.info('Listening port ' + http_port);
            if (config.productive) {
                logger.info('In production mode');
            } else {
                logger.info('In development mode (no minify/no uglify)');
            }
            if (config.demoMode) {
                logger.info('In demo mode (login disabled)');
            }
            logger.debug('loaded configuration from', config.configdir);
            logger.debug(JSON.stringify(config, null, 1));
            if (!config.productive) {
                const browserSync = require('browser-sync');
                browserSync.init({
                    port: config.appHttpPort,
                    proxy: `localhost:${appDebugHttPort}`,
                    socket: {
                        domain: `localhost:${config.nginxPort}`
                    },
                    files: ['dist'],
                    open: false,
                    ui: false
                });
            }
        });
    })
    .catch((err) => {
        logger.error(err);
        process.exit(1);
    });