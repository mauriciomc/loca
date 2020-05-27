const { promisify } = require('util');
const moment = require('moment');
const axios = require('axios');
const logger = require('winston');
const config = require('../../config');
const occupantModel = require('../models/occupant');

const _sendEmail = async message => {
    const postData = {
        templateName: message.document,
        recordId: message.tenantId,
        params: {
            term: message.term
        }
    };

    try {
        const response = await axios.post(config.EMAILER_URL, postData);

        logger.info(`POST ${config.EMAILER_URL} ${response.status}`);
        logger.debug(`data sent: ${JSON.stringify(postData)}`);
        logger.debug(`response: ${JSON.stringify(response.data)}`);

        return response.data.map(({ templateName, recordId, params, email, status, error }) => ({
            document: templateName,
            tenantId: recordId,
            term: params.term,
            email,
            status
        }));
    } catch (error) {
        logger.error(`POST ${config.EMAILER_URL} failed`);
        logger.error(`data sent: ${JSON.stringify(postData)}`);
        logger.error(error.data);
        if (config.demoMode) {
            logger.info('email status fallback workflow activated in demo mode');
            const result = {
                ...message,
                error: {
                    message: 'demo mode, mail cannot be sent'
                }
            };
            return [ result ];
        } else {
            throw error;
        }
    }
};

module.exports = {
    send: async (req, res) => {
        const realm = req.realm;
        const { document, tenantIds, year, month } = req.body;
        const term = moment(`${year}/${month}/01`, 'YYYY/MM/DD').format('YYYYMMDDHH');
        const findTenant = promisify(occupantModel.findOne).bind(occupantModel);
        const messages = await tenantIds.reduce(async (acc, tenantId) => {
            try {
                const tenant = await findTenant(realm, tenantId);
                acc.push({
                    name: tenant.name,
                    tenantId,
                    document,
                    term
                });
            } catch (error) {
                logger.error(error);
            }

            return acc;
        }, []);
        const statusList = await Promise.all(messages.map(message => _sendEmail(message)));
        try {
            const results = statusList.reduce((acc, statuses, index) => {
                acc.push(...statuses.map(status => ({ name: messages[index].name, ...status})));
                return acc;
            }, []);
            res.json(results);
        } catch(err) {
            logger.error(err);
            res.status(500).send(err);
        }
    }
};