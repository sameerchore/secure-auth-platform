# Requirements Checklist

Verification of every project requirement against the implementation.

## Core Functionality

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | Custom backend (Node/Express/PostgreSQL) | ✅ | `custom-backend/` directory |
| 2 | Appwrite implementation | ✅ | `appwrite/` directory with adapter, setup, seed scripts |
| 3 | Registration | ✅ | `POST /register` — auth.controller.js, test 1 |
| 4 | Login | ✅ | `POST /login` — auth.controller.js, test 3 |
| 5 | Logout | ✅ | `POST /logout` — auth.controller.js, test 14 |
| 6 | Server-side logout invalidation | ✅ | `revokeSessionById()` in auth.service.js, test 15 |
| 7 | Protected /me endpoint | ✅ | `GET /me` — user.controller.js, test 8 |
| 8 | Protected /files endpoint | ✅ | `GET /files` — file.controller.js, test 10 |
| 9 | Protected /files/:id endpoint | ✅ | `GET /files/:id` — file.controller.js, test 11-12 |
| 10 | 3+ test users | ✅ | alice, bob, carol in seed.js |
| 11 | Each user has profile | ✅ | full_name, display_name, bio, role in users table |
| 12 | Each user has files | ✅ | 2 files per user in seed.js |
| 13 | Password hashing | ✅ | bcrypt cost 12 in auth.service.js, test 6 |
| 14 | Generic failed-login errors | ✅ | "Invalid email or password" in auth.controller.js, tests 4-5 |
| 15 | Rate limiting / lockout | ✅ | express-rate-limit + login_attempts, test 16 |
| 16 | Consistent auth validation | ✅ | auth.middleware.js on all protected routes |
| 17 | User/file data isolation | ✅ | SQL WHERE user_id = ?, tests 10-12 |

## Authentication

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 18 | Email validation | ✅ | validators.js isValidEmail() |
| 19 | Password validation | ✅ | validators.js passwordPolicyErrors() |
| 20 | No plaintext passwords | ✅ | bcrypt.hash() in auth.service.js |
| 21 | No password logging | ✅ | logger.js never logs req.body.password |
| 22 | Duplicate email handled | ✅ | 409 response, emailExists() check |
| 23 | Server-side sessions | ✅ | sessions table, crypto.randomBytes(32) |
| 24 | Session expiration | ✅ | expires_at checked in validateSession() |
| 25 | Session revocation | ✅ | revoked_at set on logout |
| 26 | HttpOnly cookies | ✅ | cookieOptions() in auth.controller.js |
| 27 | SameSite=Lax | ✅ | cookieOptions() |
| 28 | Secure=true in production | ✅ | `secure: env.isProd()` |

## IDOR Prevention

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 29 | /files returns only user's files | ✅ | `WHERE user_id = $1` in file.service.js |
| 30 | /files/:id verifies ownership | ✅ | `WHERE id = $1 AND user_id = $2` in file.service.js |
| 31 | Cross-user file access rejected | ✅ | 403 response, tests 11-12 |
| 32 | /me cannot return another user | ✅ | Only uses req.user from middleware, test 9 |

## Security

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 33 | Helmet security headers | ✅ | app.js `app.use(helmet())` |
| 34 | CORS configuration | ✅ | Explicit origin whitelist in app.js |
| 35 | Parameterized SQL | ✅ | All queries use $1, $2 placeholders |
| 36 | No SQL concatenation | ✅ | Verified: no template literals in SQL |
| 37 | Request size limits | ✅ | `express.json({ limit: '1mb' })` |
| 38 | Path traversal protection | ✅ | `startsWith(uploadsDir)` check in file.controller.js |
| 39 | No secrets in Git | ✅ | .env in .gitignore, .env.example provided |
| 40 | No stack traces in prod | ✅ | errorHandler.js checks isProd() |
| 41 | Centralized error handling | ✅ | errorHandler.js middleware |

## Seed Data

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 42 | Reproducible seed script | ✅ | scripts/seed.js — idempotent, transactional |
| 43 | 3 users with documented passwords | ✅ | alice/bob/carol, Password123! |
| 44 | Each user has files | ✅ | 2 files each (different types) |
| 45 | Sample files on disk | ✅ | Created in uploads/ during seed |

## Documentation

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 46 | Root README.md | ✅ | Project overview, setup, architecture |
| 47 | docs/architecture.md | ✅ | ASCII diagrams, data model |
| 48 | docs/security.md | ✅ | 13-threat threat model |
| 49 | docs/api.md | ✅ | All endpoints documented |
| 50 | docs/testing.md | ✅ | Test matrix, manual testing guide |
| 51 | docs/interview-guide.md | ✅ | 22 Q&A for interview prep |
| 52 | .env.example files | ✅ | custom-backend + appwrite |
| 53 | .gitignore | ✅ | node_modules, .env, uploads |
| 54 | Custom backend README | ✅ | In root README |
| 55 | Appwrite README | ✅ | appwrite/README.md |

## Testing

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 56 | Automated test suite | ✅ | tests/auth.test.js, 35+ tests |
| 57 | Registration tests | ✅ | Tests 1, 1b, 1c, 2 |
| 58 | Login tests | ✅ | Tests 3, 4, 5 |
| 59 | Auth middleware tests | ✅ | Tests 7a-7e |
| 60 | /me isolation tests | ✅ | Tests 8, 9 |
| 61 | File isolation tests | ✅ | Tests 10, 11, 12, 13 |
| 62 | Logout tests | ✅ | Tests 14, 15, 15b, 15c |
| 63 | Rate limiting tests | ✅ | Test 16 |
| 64 | Session lifecycle tests | ✅ | Test 17 |
| 65 | Security matrix tests | ✅ | 14 cross-user scenarios |
| 66 | Provided index.html works | ✅ | Preserved, tested with custom backend |

## Appwrite

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 67 | Appwrite adapter | ✅ | appwrite/web/appwrite-adapter.js |
| 68 | Setup script | ✅ | appwrite/scripts/setup.js |
| 69 | Seed script | ✅ | appwrite/scripts/seed.js |
| 70 | Document-level permissions | ✅ | Permission.read(Role.user(userId)) |
| 71 | File-level permissions | ✅ | Storage file permissions in seed.js |
| 72 | Appwrite .env.example | ✅ | appwrite/.env.example |
| 73 | Setup instructions | ✅ | appwrite/README.md |
| 74 | Security explanation | ✅ | What Appwrite handles vs what we configure |
