/**
 * file.service.js — File data access with strict ownership enforcement.
 *
 * EVERY query filters by user_id to prevent IDOR.
 * We never return a file without verifying ownership.
 */
const { query } = require('../config/db');

/**
 * List all files belonging to a specific user.
 * Authorization is enforced at the SQL level.
 */
async function getFilesByUserId(userId) {
  const result = await query(
    `SELECT id, user_id, filename, original_filename, mime_type, size, created_at
     FROM files
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get a single file by ID, but ONLY if it belongs to the specified user.
 * This prevents IDOR — even if an attacker knows a file ID, they can't
 * access it unless they own it.
 *
 * Returns null if not found OR not owned by user.
 */
async function getFileByIdAndUser(fileId, userId) {
  const result = await query(
    `SELECT id, user_id, filename, original_filename, storage_path, mime_type, size, created_at
     FROM files
     WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Check if a file exists at all (for distinguishing 404 vs 403).
 */
async function fileExists(fileId) {
  const result = await query('SELECT 1 FROM files WHERE id = $1', [fileId]);
  return result.rows.length > 0;
}

/**
 * Insert a file record.
 */
async function createFile({ userId, filename, originalFilename, storagePath, mimeType, size }) {
  const result = await query(
    `INSERT INTO files (user_id, filename, original_filename, storage_path, mime_type, size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, filename, original_filename, mime_type, size, created_at`,
    [userId, filename, originalFilename, storagePath, mimeType, size]
  );
  return result.rows[0];
}

module.exports = { getFilesByUserId, getFileByIdAndUser, fileExists, createFile };
