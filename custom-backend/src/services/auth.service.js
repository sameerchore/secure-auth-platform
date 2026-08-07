/**
 * auth.service.js — Authentication business logic.
 *
 * Uses SECURE SERVER-SIDE SESSIONS (not JWT).
 *
 * Session strategy:
 *   1. On login, generate a cryptographically secure random session ID
 *      using crypto.randomBytes(32).
 *   2. Store a SHA-256 hash of the session ID in PostgreSQL (never the raw ID).
 *   3. Return the raw session ID to the client (via HttpOnly cookie + response body).
 *   4. On each request, the middleware hashes the incoming session ID and
 *      looks it up in the sessions table.
 *   5. On logout, mark the session as revoked (set revoked_at).
 *
 * Why hash the session ID in the DB?
 *   If the sessions table is ever leaked (SQL dump, backup exposure),
 *   the attacker cannot use the hashed values to forge session cookies.
 *
 * Passwords are hashed with bcrypt (cost factor 12).
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/db');
const env    = require('../config/env');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

// ── Session ID Generation ─────────────────────────────────

/**
 * Generate a cryptographically secure random session ID (hex string).
 * 32 bytes = 256 bits of entropy.
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a session ID with SHA-256 for storage.
 */
function hashSessionId(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

// ── Registration ──────────────────────────────────────────

async function registerUser({ email, password, fullName, displayName }) {
  // Hash password — NEVER store plaintext
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, display_name, role, created_at`,
    [email, passwordHash, fullName || '', displayName || email.split('@')[0]]
  );

  logger.info('User registered: %s', email);
  return result.rows[0];
}

/**
 * Check if an email is already registered.
 */
async function emailExists(email) {
  const result = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  return result.rows.length > 0;
}

// ── Login ─────────────────────────────────────────────────

/**
 * Verify credentials. Returns the user row (without password_hash) or null.
 * Uses constant-time comparison to prevent timing attacks.
 */
async function verifyCredentials(email, password) {
  const result = await query(
    'SELECT id, email, password_hash, full_name, display_name, bio, role, created_at FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    // Constant-time: still run a hash comparison to prevent timing attacks
    // that could reveal whether an email exists
    await bcrypt.hash(password, BCRYPT_ROUNDS);
    return null;
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) return null;

  // Strip password_hash before returning
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

// ── Sessions ──────────────────────────────────────────────

/**
 * Create a new server-side session.
 * Returns { sessionId, expiresAt } where sessionId is the raw (unhashed) token.
 */
async function createSession(userId) {
  const sessionId  = generateSessionId();
  const tokenHash  = hashSessionId(sessionId);
  const expiresAt  = new Date(Date.now() + env.SESSION_EXPIRY_MS);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  logger.info('Session created for user %s', userId);

  return { sessionId, expiresAt };
}

/**
 * Validate a session ID.
 * Hashes the incoming ID and checks against the sessions table.
 * Returns { userId, sessionDbId } or null if invalid.
 */
async function validateSession(sessionId) {
  if (!sessionId) return null;

  const tokenHash = hashSessionId(sessionId);

  const result = await query(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked_at
     FROM sessions s
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) return null;

  const session = result.rows[0];

  // Check revocation
  if (session.revoked_at) {
    logger.debug('Rejected revoked session');
    return null;
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    logger.debug('Rejected expired session');
    return null;
  }

  return { userId: session.user_id, sessionDbId: session.id };
}

/**
 * Revoke a session by its raw session ID.
 */
async function revokeSessionById(sessionId) {
  const tokenHash = hashSessionId(sessionId);
  await query(
    'UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash]
  );
  logger.info('Session revoked');
}

/**
 * Revoke ALL sessions for a user.
 */
async function revokeAllUserSessions(userId) {
  await query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

// ── Account Lockout ───────────────────────────────────────

/**
 * Record a login attempt (success or failure) in the DB.
 */
async function recordLoginAttempt(email, ipAddress, success) {
  await query(
    'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
    [email, ipAddress || '0.0.0.0', success]
  );
}

/**
 * Check whether an email is currently locked out.
 * Returns { locked: boolean, retryAfterMs?: number }.
 */
async function checkAccountLockout(email) {
  const windowStart = new Date(Date.now() - env.LOCKOUT_DURATION_MS);

  // Count recent consecutive failures since last success within lockout window
  const result = await query(
    `SELECT COUNT(*) AS fail_count
     FROM login_attempts
     WHERE email = $1
       AND success = FALSE
       AND attempted_at > $2
       AND attempted_at > COALESCE(
         (SELECT MAX(attempted_at) FROM login_attempts WHERE email = $1 AND success = TRUE),
         '1970-01-01'::timestamptz
       )`,
    [email, windowStart]
  );

  const failCount = parseInt(result.rows[0].fail_count, 10);

  if (failCount >= env.LOCKOUT_THRESHOLD) {
    const lastFailure = await query(
      `SELECT attempted_at FROM login_attempts
       WHERE email = $1 AND success = FALSE
       ORDER BY attempted_at DESC LIMIT 1`,
      [email]
    );

    if (lastFailure.rows.length > 0) {
      const lockoutEnds = new Date(lastFailure.rows[0].attempted_at).getTime() + env.LOCKOUT_DURATION_MS;
      if (Date.now() < lockoutEnds) {
        return { locked: true, retryAfterMs: lockoutEnds - Date.now() };
      }
    }
  }

  return { locked: false };
}

module.exports = {
  generateSessionId,
  hashSessionId,
  registerUser,
  emailExists,
  verifyCredentials,
  createSession,
  validateSession,
  revokeSessionById,
  revokeAllUserSessions,
  recordLoginAttempt,
  checkAccountLockout,
};
