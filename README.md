# Secure Auth Platform

A complete secure login system with user details and file access, implemented twice:

1. **Custom Backend** — Node.js + Express + PostgreSQL
2. **Appwrite Backend** — Appwrite managed services

Both implementations provide registration, login, logout, protected profile access, and file access with strict per-user data isolation.

---

## Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **Docker** (for the PostgreSQL database)

### 1. Setup Database & Dependencies

```bash
# 1. Install dependencies
cd custom-backend
npm install
cd ..

# 2. Start the database (runs on port 5433)
docker compose up -d

# 3. Create tables and seed test users
cd custom-backend
npm run setup
cd ..
```

### 2. Run the Project (One-Click Start)

We've provided a bash script to automatically start both the backend and frontend simultaneously:

```bash
# From the project root
./start.sh
```
*(This will start the Node API on port 3000 and the Web UI on port 5500.)*

### 3. Test with the Client
 
Open **http://localhost:5500** in your web browser.

1. Select **"Custom REST backend"** mode
2. Set Base URL to `http://localhost:3000`
3. Check **"Backend uses cookie sessions"**
4. Use the quick-fill buttons at the top to test with the seeded users!

### 4. Run Tests (Optional)

```bash
cd custom-backend
npm test
```

---

## Test Accounts

| Email | Password | Name |
|-------|----------|------|
| alice@example.com | Password123! | Alice Nakamura |
| bob@example.com | Password123! | Bob Alvarez |
| carol@example.com | Password123! | Carol Whitfield |

Each user has 2 seeded files. Users can only access their own files.

---

## Repository Structure

```
secure-auth-platform/
│
├── index.html                 ← Testing client (DO NOT modify)
├── mock-api.js                ← In-browser mock (reference only)
├── seed-data.json             ← Seed data reference
├── docker-compose.yml         ← PostgreSQL container
│
├── web/
│   └── index.html             ← Copy of testing client
│
├── custom-backend/
│   ├── src/
│   │   ├── config/            ← Database & env configuration
│   │   │   ├── db.js
│   │   │   └── env.js
│   │   ├── controllers/       ← Request handlers (thin layer)
│   │   │   ├── auth.controller.js
│   │   │   ├── user.controller.js
│   │   │   └── file.controller.js
│   │   ├── middleware/         ← Auth, rate limiting, error handling
│   │   │   ├── auth.middleware.js
│   │   │   ├── rateLimiter.middleware.js
│   │   │   └── errorHandler.js
│   │   ├── routes/             ← Express route definitions
│   │   │   ├── auth.routes.js
│   │   │   ├── user.routes.js
│   │   │   └── file.routes.js
│   │   ├── services/           ← Business logic
│   │   │   ├── auth.service.js
│   │   │   ├── user.service.js
│   │   │   └── file.service.js
│   │   ├── db/                 ← Schema & migrations
│   │   │   ├── schema.sql
│   │   │   └── migrate.js
│   │   ├── utils/              ← Validators, logger
│   │   │   ├── validators.js
│   │   │   └── logger.js
│   │   └── app.js              ← Express entry point
│   ├── scripts/
│   │   └── seed.js             ← Database seeding
│   ├── uploads/                ← File storage
│   ├── tests/
│   │   └── auth.test.js        ← Jest + Supertest test suite
│   ├── package.json
│   ├── .env.example
│   └── .env
│
├── appwrite/
│   ├── web/
│   │   └── appwrite-adapter.js ← Client-side Appwrite adapter
│   ├── scripts/
│   │   ├── setup.js            ← Creates DB, collection, bucket
│   │   └── seed.js             ← Seeds test data
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── api.md
│   ├── testing.md
│   ├── interview-guide.md
│   └── requirements-checklist.md
│
├── .gitignore
└── README.md                   ← This file
```

---

## Architecture

### Custom Backend

```
Client (index.html)
       │
       ▼
   Express App
       │
  ┌────┴────┐
  │ Helmet  │ CORS │ Cookie Parser │ Rate Limiter
  └────┬────┘
       │
  ┌────┴────┐
  │  Routes │  (auth, user, file)
  └────┬────┘
       │
  ┌────┴────────┐
  │ Auth Middleware │  ← extracts session from cookie/bearer
  └────┬────────┘      validates against sessions table
       │
  ┌────┴────────┐
  │ Controllers │  ← thin: validate input, call service, format response
  └────┬────────┘
       │
  ┌────┴────────┐
  │  Services   │  ← business logic: hashing, session management
  └────┬────────┘
       │
  ┌────┴────────┐
  │ PostgreSQL  │  ← parameterized queries only
  └─────────────┘
```

### Authentication Strategy: Server-Side Sessions

**Why sessions instead of JWT?**

The assignment explicitly requires server-side logout invalidation. With stateless JWTs, the server cannot truly "invalidate" a token — it remains valid until expiry. Server-side sessions solve this:

1. **Login** → Generate a 256-bit cryptographically random session ID → Hash it (SHA-256) → Store in `sessions` table → Return raw ID as HttpOnly cookie + response body
2. **Protected request** → Extract session ID from cookie/bearer → Hash it → Look up in `sessions` table → Verify not expired/revoked → Attach user
3. **Logout** → Set `revoked_at = NOW()` on the session row → Clear cookie → Session ID is now permanently invalid

**Cookie configuration:**
- `HttpOnly: true` — JavaScript cannot read the cookie (XSS protection)
- `SameSite: Lax` — CSRF mitigation, allows top-level navigation
- `Secure: true` in production — cookie only sent over HTTPS
- `maxAge: 24h` — matches server-side session expiry

### Logout Implementation

Logout is a **server-side operation**, not just client-side token deletion:

```
POST /logout
    ↓
Auth middleware validates session
    ↓
Controller calls authService.revokeSessionById(sessionId)
    ↓
UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1
    ↓
Cookie cleared (res.clearCookie)
    ↓
Any subsequent request with the old session ID → 401
```

### User Data Isolation

**Principle:** The server determines user identity from the validated session. No user-supplied `userId` parameter is ever trusted.

```
Authenticated request
    ↓
Auth middleware → req.user.id (from session → DB lookup)
    ↓
SELECT * FROM files WHERE user_id = req.user.id  ← always filtered
    ↓
Only this user's data returned
```

**IDOR prevention** on `GET /files/:id`:
```sql
-- ✅ Correct: ownership check in SQL
SELECT * FROM files WHERE id = $1 AND user_id = $2

-- ❌ Wrong: fetch then check (vulnerable to bugs)
SELECT * FROM files WHERE id = $1
```

### File Authorization

```
GET /files/:id
    ↓
Auth middleware → req.user.id
    ↓
SELECT * FROM files WHERE id = $1 AND user_id = $2
    ↓
Found? → 200 with file data
Not found? → Check if file exists at all
    ↓
Exists but wrong owner → 403 "You do not have access to this file"
Does not exist → 404 "File not found"
```

### Rate Limiting

Two layers:
1. **IP-based** — `express-rate-limit` on `/login` (10 attempts per 15 minutes)
2. **Account-based** — Failed attempts tracked in `login_attempts` table. After 5 consecutive failures for an email, the account is locked for 5 minutes. Successful login resets the counter.

---

## Database Schema

```sql
users
├── id (UUID PK)
├── email (VARCHAR UNIQUE)
├── password_hash (VARCHAR, bcrypt)
├── full_name, display_name, bio, role
├── created_at, updated_at

sessions
├── id (UUID PK)
├── user_id (FK → users.id)
├── token_hash (VARCHAR UNIQUE, SHA-256 of session ID)
├── expires_at (TIMESTAMPTZ)
├── revoked_at (TIMESTAMPTZ, NULL = active)

files
├── id (UUID PK)
├── user_id (FK → users.id)
├── filename (safe server-side name)
├── original_filename (user-facing name)
├── storage_path, mime_type, size
├── created_at

login_attempts
├── id (SERIAL PK)
├── email, ip_address
├── attempted_at, success
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /register | No | Create account |
| POST | /login | No | Authenticate, get session |
| POST | /logout | Yes | Revoke session |
| GET | /me | Yes | Current user profile |
| GET | /files | Yes | List user's files |
| GET | /files/:id | Yes | Single file metadata |
| GET | /files/:id/download | Yes | Download file content |
| GET | /health | No | Health check |

See [docs/api.md](docs/api.md) for complete API documentation.

---

## Security Controls

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt (cost factor 12) |
| Session management | Cryptographic random IDs, SHA-256 hashed in DB |
| Session cookies | HttpOnly, SameSite=Lax, Secure (prod) |
| Session revocation | Server-side revoked_at field |
| Rate limiting | IP-based + per-account lockout |
| Security headers | Helmet.js |
| CORS | Explicit origin whitelist, credentials mode |
| SQL injection | Parameterized queries ($1, $2...) only |
| IDOR prevention | All queries filter by authenticated user_id |
| Path traversal | Resolved path checked against uploads directory |
| Input validation | Email format, password policy |
| Error handling | Generic errors, no stack traces in production |
| Logging | Winston, never logs passwords/tokens |

See [docs/security.md](docs/security.md) for threat model.

---

## Appwrite Implementation

See [appwrite/README.md](appwrite/README.md) for complete setup instructions.

### What Appwrite Handles

- Password hashing (Argon2id, automatic)
- Session management (cookie-based)
- Rate limiting (built-in)
- Email uniqueness

### What We Configure

- Collection permissions (per-document read/write)
- Storage permissions (per-file read/write)
- Adapter logic (maps API contract to Appwrite SDK)

### Custom Backend vs Appwrite Comparison

| Feature | Custom Backend | Appwrite |
|---------|---------------|----------|
| Password hashing | We implement (bcrypt) | Automatic (Argon2id) |
| Session storage | PostgreSQL table | Appwrite managed |
| Session revocation | We implement (revoked_at) | SDK: deleteSession() |
| Rate limiting | express-rate-limit + DB | Built-in |
| File permissions | SQL WHERE user_id = ? | Document-level permissions |
| Data isolation | Our SQL queries | Appwrite permission rules |
| Deployment | Our responsibility | Appwrite Cloud / self-hosted |

---

## Troubleshooting

### PostgreSQL Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
→ Ensure PostgreSQL is running: `docker compose up -d`

### CORS Errors
→ Add your client's origin to `CORS_ORIGIN` in `.env`

### Cookie Not Set
→ Ensure the client origin matches CORS settings and `credentials: 'include'` is enabled

### Tests Failing
→ Ensure `DATABASE_URL` in `.env` points to a running PostgreSQL instance
→ Run `npm run migrate` before tests

---

## Known Limitations

1. **File upload** — not implemented (files are seeded); could add `POST /files` with multer
2. **Password reset** — not implemented; would need email service
3. **HTTPS** — development runs over HTTP; production requires TLS termination
4. **Session cleanup** — expired sessions remain in DB; would add a periodic cleanup job
5. **Appwrite** — requires manual project setup (cannot be fully automated without an existing instance)

---

## Future Improvements

- Add file upload endpoint with multer + content validation
- Implement refresh tokens or sliding session expiry
- Add email verification on registration
- Add password change endpoint (revokes all other sessions)
- Add periodic expired-session cleanup cron
- Add request/response logging middleware
- Deploy with HTTPS, set `Secure: true` for cookies
- Add CSRF token for non-API form submissions
- Implement account deletion (GDPR)

---

## Documentation

- [Architecture](docs/architecture.md)
- [Security & Threat Model](docs/security.md)
- [API Documentation](docs/api.md)
- [Testing Guide](docs/testing.md)
- [Interview Guide](docs/interview-guide.md)
- [Requirements Checklist](docs/requirements-checklist.md)
