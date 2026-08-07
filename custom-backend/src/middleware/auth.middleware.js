/**
 * auth.middleware.js — Authentication middleware.
 *
 * Extracts the session ID from EITHER:
 *   1. HttpOnly cookie (preferred, set by server on login)
 *   2. Authorization: Bearer <sessionId> header (fallback for testing)
 *
 * Then validates the session against the PostgreSQL sessions table:
 *   - Session must exist
 *   - Session must not be expired
 *   - Session must not be revoked
 *
 * On success, attaches the authenticated user to req.user.
 *
 * This is the ONLY source of identity for protected routes.
 * Controllers never trust userId from query params or request body.
 */
const env = require('../config/env');
const { query } = require('../config/db');
const authService = require('../services/auth.service');
const logger = require('../utils/logger');

async function authenticate(req, res, next) {
  try {
    // 1. Extract session ID from cookie or Bearer header
    let sessionId = null;

    // Check HttpOnly cookie first
    if (req.cookies && req.cookies[env.COOKIE_NAME]) {
      sessionId = req.cookies[env.COOKIE_NAME];
    }

    // Fallback to Bearer token (for testing without cookies)
    if (!sessionId) {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer (.+)$/i);
      if (match) {
        sessionId = match[1];
      }
    }

    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // 2. Validate session against database
    const sessionData = await authService.validateSession(sessionId);

    if (!sessionData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // 3. Load user profile (no password_hash)
    const userResult = await query(
      `SELECT id, email, full_name, display_name, bio, role, created_at, updated_at
       FROM users WHERE id = $1`,
      [sessionData.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // 4. Attach to request
    req.user      = userResult.rows[0];
    req.sessionId = sessionId;   // raw session ID (for logout revocation)
    next();
  } catch (err) {
    logger.error('Auth middleware error: %s', err.message);
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { authenticate };
