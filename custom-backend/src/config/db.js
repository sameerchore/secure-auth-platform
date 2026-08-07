/**
 * db.js — PostgreSQL connection pool.
 *
 * Uses the pg library with parameterized queries only.
 * Never build SQL via string concatenation with user input.
 */
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Sensible pool defaults
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log connection errors (but never secrets)
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Helper: run a single parameterized query.
 * @param {string} text  SQL with $1, $2, ... placeholders
 * @param {any[]}  params
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { pool, query };
