/**
 * rateLimiter.middleware.js — Brute-force protection.
 *
 * Two layers:
 *   1. express-rate-limit — IP-based global rate limiting on login endpoint
 *   2. Account-level lockout — tracks failed attempts per email in the DB
 *
 * Strategy:
 *   - After LOCKOUT_THRESHOLD consecutive failures for an email,
 *     the account is locked for LOCKOUT_DURATION_MS.
 *   - Successful login resets the counter.
 *   - We never permanently lock accounts.
 */
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * IP-based rate limiter for the login endpoint.
 * Limits total login attempts per IP within a time window.
 */
const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  // Skip in test environment to allow rapid automated testing
  skip: () => env.isTest(),
});

/**
 * Global rate limiter — softer limit for all endpoints.
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  skip: () => env.isTest(),
});

module.exports = { loginRateLimiter, globalRateLimiter };
