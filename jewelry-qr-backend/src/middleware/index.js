const { protect, authorize, optionalAuth } = require('./auth.middleware');
const { validate, schemas } = require('./validation.middleware');

module.exports = {
    protect,
    authorize,
    optionalAuth,
    validate,
    schemas
};
