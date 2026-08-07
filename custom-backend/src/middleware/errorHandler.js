/**
 * errorHandler.js — Centralized error-handling middleware.
 *
 * - Development: returns error message + stack for debugging.
 * - Production: returns only a generic message — never exposes
 *   stack traces, SQL errors, internal paths, or secrets.
 */
const env    = require('../config/env');
const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error: %s', err.message, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  const status = err.status || err.statusCode || 500;

  if (env.isProd()) {
    return res.status(status).json({
      error: status === 500
        ? 'An unexpected error occurred'
        : err.message || 'An error occurred',
    });
  }

  // Development / test — more details
  return res.status(status).json({
    error: err.message || 'An unexpected error occurred',
    ...(err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
