# Testing Guide

## Running Tests

```bash
cd custom-backend
npm test
```

### Prerequisites

- PostgreSQL must be running (via Docker or locally)
- `DATABASE_URL` in `.env` must be correct
- Schema must be applied: `npm run migrate`

### Test Environment

Tests run with `NODE_ENV=test`, which:
- Suppresses console logging (Winston silent mode)
- Skips IP-based rate limiting (allows rapid automated testing)
- Account-based lockout still works (tested explicitly)

## Test Suite Overview

The test suite (`tests/auth.test.js`) contains **35+ tests** organized into these categories:

### 1. Registration (Tests 1-2)
- ✅ Registration succeeds with valid email + password
- ✅ Three users (A, B, C) registered successfully
- ✅ Duplicate email returns 409
- ✅ Invalid email returns 400
- ✅ Weak password returns 400

### 2. Login (Tests 3-5)
- ✅ Correct credentials → 200 with token and user
- ✅ HttpOnly cookie is set on login
- ✅ Wrong password → 401 "Invalid email or password"
- ✅ Unknown email → 401 "Invalid email or password" (same error)
- ✅ Missing fields → 400
- ✅ Error message never reveals whether email exists

### 3. Password Hashing (Test 6)
- ✅ Database stores bcrypt hash (starts with $2b$)
- ✅ Hash is not the plaintext password

### 4. Authentication Middleware (Test 7)
- ✅ /me without auth → 401
- ✅ /files without auth → 401
- ✅ /files/:id without auth → 401
- ✅ Invalid token → 401
- ✅ Malformed Authorization header → 401

### 5. User Isolation (Tests 8-9)
- ✅ /me returns the authenticated user's profile
- ✅ /me?userId=otherUser still returns the authenticated user (ignores param)

### 6. File Isolation & IDOR Prevention (Tests 10-13)
- ✅ /files returns only the authenticated user's files
- ✅ User A can access their own file → 200
- ✅ User A cannot access User B's file → 403
- ✅ User B cannot access User A's file → 403
- ✅ User A cannot download User B's file → 403
- ✅ Nonexistent file → 404
- ✅ User A can download their own file → 200

### 7. Logout & Session Invalidation (Tests 14-15)
- ✅ Before logout: /me works with session → 200
- ✅ POST /logout → 200 "Logged out"
- ✅ Cookie is cleared on logout
- ✅ After logout: /me with old session → 401
- ✅ After logout: /files with old session → 401
- ✅ After logout: /files/:id with old session → 401

### 8. Rate Limiting / Lockout (Test 16)
- ✅ 6 failed login attempts → 429 on next attempt

### 9. Session Lifecycle (Test 17)
- ✅ Manually revoked session (via DB UPDATE) → 401

### 10. Security Test Matrix
- ✅ User A → A's profile
- ✅ User B → B's profile
- ✅ User C → C's profile
- ✅ User A → B's file = denied
- ✅ User B → A's file = denied
- ✅ User A → C's file = denied
- ✅ User C → A's file = denied
- ✅ User B → C's file = denied
- ✅ No auth → /me = 401
- ✅ No auth → /files = 401
- ✅ No auth → /files/:id = 401
- ✅ Wrong email + password → generic error
- ✅ Correct email + wrong password → same generic error
- ✅ Logout then reuse old credential → 401

---

## Security Test Matrix

| # | Test Scenario | Expected | Status |
|---|--------------|----------|--------|
| 1 | User A logs in → GET /me | A's profile | ✅ |
| 2 | User A → GET /files | Only A's files | ✅ |
| 3 | User A → GET /files/B-file | 403 Forbidden | ✅ |
| 4 | User A → GET /files/C-file | 403 Forbidden | ✅ |
| 5 | User B → GET /files/A-file | 403 Forbidden | ✅ |
| 6 | User C → GET /files/A-file | 403 Forbidden | ✅ |
| 7 | No auth → GET /me | 401 Unauthorized | ✅ |
| 8 | No auth → GET /files | 401 Unauthorized | ✅ |
| 9 | No auth → GET /files/:id | 401 Unauthorized | ✅ |
| 10 | Wrong email + password | 401 "Invalid email or password" | ✅ |
| 11 | Correct email + wrong password | 401 "Invalid email or password" (same!) | ✅ |
| 12 | 5+ failed logins | 429 Too Many Requests | ✅ |
| 13 | Logout → reuse old session | 401 Unauthorized | ✅ |
| 14 | Revoked session → /me | 401 Unauthorized | ✅ |

---

## Manual Testing with index.html

1. Start the server: `npm run dev`
2. Serve index.html: `npx serve .` (from project root)
3. Select "Custom REST backend" mode
4. Set Base URL to `http://localhost:3000`
5. Check "Backend uses cookie sessions"

### Test Scenario: Cross-User Isolation

1. Click "User A: alice@example.com" → Login
2. Click "GET /me" → Should show Alice's profile
3. Click "GET /files" → Should show only Alice's files
4. Note a file ID from Alice's files
5. Click "Logout"
6. Click "User B: bob@example.com" → Login
7. Click "GET /me" → Should show Bob's profile
8. Click "GET /files" → Should show only Bob's files
9. Enter Alice's file ID in the File ID field → Click "GET /files/:id"
10. **Expected: 403 "You do not have access to this file"**

### Test Scenario: Logout Invalidation

1. Login as Alice → Note the token
2. Click "GET /me" → Works (200)
3. Click "Logout"
4. Paste the old token back into the Token field
5. Click "GET /me"
6. **Expected: 401 "Not authenticated"**
