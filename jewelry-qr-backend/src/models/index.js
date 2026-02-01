const User = require('./User');
const Item = require('./Item');
const Settings = require('./Settings');
const Counter = require('./Counter');

// Modular architecture models (v1.4.0)
const ItemMaster = require('./ItemMaster');
const AttributeSchema = require('./AttributeSchema');
const PricingRule = require('./PricingRule');
const RateTable = require('./RateTable');

module.exports = {
    User,
    Item,
    Settings,
    Counter,
    // Modular models
    ItemMaster,
    AttributeSchema,
    PricingRule,
    RateTable
};
