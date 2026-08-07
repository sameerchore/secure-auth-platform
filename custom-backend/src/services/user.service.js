/**
 * user.service.js — User data access.
 *
 * The authenticated user is determined entirely by the session middleware.
 * We never accept a userId from query params or request body for authorization.
 */
const { query } = require('../config/db');

/**
 * Get user profile by ID. Returns null if not found.
 * Never returns password_hash.
 */
async function getUserById(userId) {
  const result = await query(
    `SELECT id, email, full_name, display_name, bio, role, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = { getUserById };
