-- ============================================================
-- Secure Auth Platform — PostgreSQL Schema
-- ============================================================
-- Run with: psql -d secure_auth_db -f schema.sql
-- Or use the migrate.js script: npm run migrate
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL DEFAULT '',
  display_name  VARCHAR(100) NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  role          VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- SESSIONS
-- Stores server-side session records so logout actually works.
-- token_hash stores a SHA-256 hash of the JWT, not the raw JWT.
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);

-- ============================================================
-- FILES
-- Each file belongs to exactly one user (enforced by FK).
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename          VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path      VARCHAR(512) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  size              BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- ============================================================
-- LOGIN_ATTEMPTS
-- For brute-force / rate-limiting tracking at the DB level.
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  ip_address    VARCHAR(45),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip    ON login_attempts(ip_address);
