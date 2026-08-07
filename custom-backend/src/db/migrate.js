/**
 * migrate.js — Runs the schema.sql file against the configured database.
 *
 * Usage: npm run migrate
 *
 * Idempotent — uses IF NOT EXISTS so it can be run repeatedly.
 */
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[migrate] Schema applied successfully.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
