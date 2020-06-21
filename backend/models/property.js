'use strict';
const OF = require('./objectfilter');
const Model = require('./model');

class PropertyModel extends Model {
    constructor() {
        super('properties');
        this.schema = new OF({
            _id: String,
            type: String,
            name: String,
            description: String,
            surface: Number,
            phone: String,
            building: String,
            level: String,
            location: String,
            price: Number,
            expense: Number
        });
    }

    findAll(realm, callback) {
        super.findAll(realm, (errors, properties) => {
            if (errors && errors.length > 0) {
                callback(errors);
                return;
            }

            callback(null, properties.sort((p1, p2) => {
                if (p1.type === p2.type) {
                    return p1.name.localeCompare(p2.name);
                }
                return p1.type.localeCompare(p2.type);
            }));
        });
    }
}

module.exports = new PropertyModel();