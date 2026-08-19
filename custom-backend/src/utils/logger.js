/**
 * logger.js — Safe application logging via Winston.
 *
 * NEVER logs: passwords, tokens, session secrets, API keys.
 * Development mode is more verbose; production suppresses debug.
 */
const { createLogger, format, transports } = require('winston');
const env = require('../config/env');

const logger = createLogger({
  level: env.isDev() || env.isTest() ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new transports.Console({
      silent: env.isTest(), // suppress console output during tests
    }),
  ],
});

module.exports = logger;
