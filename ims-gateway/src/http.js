'use strict';

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

/** Validate against a Joi schema; throws 422 with a readable message. */
function validate(value, schema) {
    const { error, value: clean } = schema.validate(value, { abortEarly: true, stripUnknown: true, convert: true });
    if (error) throw new HttpError(422, error.details[0].message.replace(/"/g, ''));
    return clean;
}

/** Async route wrapper so thrown errors reach the error handler. */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, validate, wrap };
