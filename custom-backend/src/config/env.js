/**
 * env.js — Centralized environment configuration.
 *
 * Loads .env in non-production environments and exports
 * validated config values used throughout the application.
 */
const path = require('path');

// Load .env file from custom-backend root
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
}

const env = {
  NODE_ENV:        process.env.NODE_ENV || 'development',
  PORT:            parseInt(process.env.PORT, 10) || 3000,
  DATABASE_URL:    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/secure_auth_db',

  // Session / Cookie
  COOKIE_SECRET:     process.env.COOKIE_SECRET || 'dev-only-cookie-secret-change-in-production',
  SESSION_EXPIRY_MS: parseInt(process.env.SESSION_EXPIRY_MS, 10) || 24 * 60 * 60 * 1000, // 24 hours
  COOKIE_NAME:       process.env.COOKIE_NAME || 'sid',

  // Rate limiting
  LOGIN_RATE_LIMIT_WINDOW_MS: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  LOGIN_RATE_LIMIT_MAX:       parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  LOCKOUT_THRESHOLD:          parseInt(process.env.LOCKOUT_THRESHOLD, 10) || 5,
  LOCKOUT_DURATION_MS:        parseInt(process.env.LOCKOUT_DURATION_MS, 10) || 5 * 60 * 1000,

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3001'],

  isProd()  { return this.NODE_ENV === 'production'; },
  isDev()   { return this.NODE_ENV === 'development'; },
  isTest()  { return this.NODE_ENV === 'test'; },
};

module.exports = env;
