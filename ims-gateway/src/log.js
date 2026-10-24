'use strict';
const pino = require('pino');
const config = require('./config');

module.exports = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(config.isProd ? {} : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
});
