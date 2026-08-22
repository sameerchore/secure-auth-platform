# Interview Guide

Concise answers to anticipated technical interview questions about this project.

---

## Architecture & Design

### 1. Why this architecture?

Layered architecture (routes → controllers → services → DB) separates concerns clearly. Routes define URL patterns, controllers handle HTTP request/response, services contain business logic, and the DB layer handles data access. This makes the code testable, maintainable, and easy to explain in an interview.

### 2. Why PostgreSQL?

- Relational model naturally fits users → sessions → files relationships
- Strong ACID guarantees for authentication operations
- Foreign key constraints enforce data integrity at the DB level
- UUID primary keys prevent sequential enumeration
- Mature, production-proven, widely understood

### 3. Why server-side sessions instead of JWT?

The assignment requires logout to truly invalidate the session. With stateless JWT:
- The server can't revoke a token — it's valid until it expires
- A "revocation list" is essentially a server-side session store, defeating the purpose

With server-side sessions:
- Logout sets `revoked_at = NOW()` — the session is immediately invalid
- Every request checks the session table — revoked sessions are rejected
- No need for token refresh or revocation lists

**Trade-off:** Slightly more DB load (one query per request), but for this application scale it's negligible.

---

## Authentication

### 4. How does authentication work?

1. **Login:** Verify credentials → generate 256-bit random session ID → hash with SHA-256 → store hash in `sessions` table → return raw ID as HttpOnly cookie + response body
2. **Request:** Extract session ID from cookie (or Bearer header) → hash it → look up in sessions table → verify not expired/revoked → load user → attach to request
3. **Logout:** Hash the session ID → set `revoked_at = NOW()` on the row → clear cookie

### 5. How does logout work internally?

```sql
UPDATE sessions SET revoked_at = NOW()
WHERE token_hash = SHA256(incoming_session_id);
```

The session row remains in the database but is permanently marked as revoked. Any subsequent request with that session ID will be rejected because the middleware checks `revoked_at IS NULL`.

### 6. Why isn't client-side token deletion enough?

If we only delete the token from localStorage/cookie on the client:
- An attacker who captured the token (XSS, network sniffing, logs) can still use it
- The server would still accept it until expiry
- There's no way to force-invalidate all sessions on password change

Server-side revocation means the token is dead on the server, regardless of who holds it.

### 7. How are passwords stored?

Passwords are hashed with **bcrypt** (cost factor 12). The raw password is:
- Never stored in the database
- Never logged (logger explicitly avoids it)
- Never returned in any API response
- Compared using `bcrypt.compare()` which is timing-safe

### 8. Why bcrypt?

- bcrypt is a purpose-built password hashing function (unlike SHA-256 which is too fast)
- Cost factor 12 means ~250ms per hash — fast enough for login, too slow for brute force
- Automatic salt generation prevents rainbow table attacks
- Widely audited, battle-tested library (node `bcrypt`)

---

## Data Isolation

### 9. How is user isolation enforced?

**Principle:** The server determines identity from the validated session. No client-supplied `userId` is trusted.

```
validated session → session.user_id → use ONLY this for DB queries
```

Every data query includes the authenticated user's ID:
```sql
SELECT * FROM files WHERE user_id = $authenticated_user_id
```

### 10. What is IDOR?

**Insecure Direct Object Reference** — an attacker changes an ID in a URL to access another user's resource.

Example: User A requests `GET /files/file-123` (their file). They change it to `GET /files/file-456` (User B's file). Without IDOR protection, they'd get B's file.

### 11. How does /files/:id prevent IDOR?

```sql
-- The query includes BOTH the file ID and the authenticated user's ID
SELECT * FROM files WHERE id = $1 AND user_id = $2
```

If the file exists but belongs to another user, this returns zero rows → 403 Forbidden.

We do NOT do:
```sql
-- WRONG: fetches the file regardless of owner
SELECT * FROM files WHERE id = $1
-- Then check ownership in application code (error-prone)
```

### 12. Why can't User A access User B's files?

Three layers of enforcement:
1. **GET /files** — SQL query filters by `user_id = authenticated_user_id`
2. **GET /files/:id** — SQL includes `AND user_id = authenticated_user_id`
3. **GET /files/:id/download** — Same ownership check before streaming

The user ID comes from the validated session, not from any request parameter.

---

## Security

### 13. How does rate limiting work?

Two layers:
1. **IP-based** (express-rate-limit): 10 login attempts per 15 minutes per IP address
2. **Account-based** (login_attempts table): After 5 consecutive failures for an email, that email is locked for 5 minutes

Successful login resets the account lockout counter. Accounts are never permanently locked.

### 14. Why generic login errors?

"Invalid email or password" prevents **account enumeration** — an attacker can't determine which emails are registered by observing different error messages.

If we said "Email not registered" vs "Incorrect password", an attacker could:
1. Try random emails until they find one that returns "Incorrect password"
2. Now they know that email is registered
3. Focus brute-force attacks on that email

### 15. What are the main attack surfaces?

| Surface | Risk | Mitigation |
|---------|------|-----------|
| Login endpoint | Brute force | Rate limiting + lockout |
| Session cookie | Theft via XSS | HttpOnly flag |
| File endpoint | IDOR | SQL ownership check |
| SQL queries | Injection | Parameterized queries |
| File download | Path traversal | Path validation |
| Error responses | Info leakage | Generic errors in prod |

---

## Appwrite

### 16. How does Appwrite authentication differ?

Appwrite handles the entire auth stack:
- Password hashing (Argon2id) — automatic, we never see the hash
- Session management — secure cookies, server-side storage
- Account API — create, login, logout, get current user
- Rate limiting — built-in per-IP

We just call SDK methods: `account.create()`, `account.createEmailPasswordSession()`, `account.deleteSession('current')`, `account.get()`.

### 17. What does Appwrite automatically handle?

| Feature | Custom Backend (we build) | Appwrite (automatic) |
|---------|--------------------------|---------------------|
| Password hashing | bcrypt in auth.service.js | Argon2id internal |
| Session storage | PostgreSQL sessions table | Appwrite internal |
| Rate limiting | express-rate-limit + DB | Built-in |
| Email uniqueness | DB UNIQUE constraint | Automatic |
| Session revocation | revoked_at field | deleteSession() |

### 18. What did we configure ourselves?

- **Collection permissions:** `documentSecurity: true` with per-document `Permission.read(Role.user(ownerId))`
- **Storage permissions:** Per-file `Permission.read(Role.user(ownerId))`
- **Adapter logic:** The `appwrite-adapter.js` that maps our API contract to Appwrite SDK calls
- **Data schema:** Collection attributes (ownerId, fileName, mimeType, etc.)

---

## Session Lifecycle

### 19. What happens when a session expires?

The middleware checks `expires_at` on every request:
```javascript
if (new Date(session.expires_at) < new Date()) {
  return 401; // Session expired
}
```

Expired sessions remain in the database but are rejected. A cleanup job should periodically delete old sessions.

### 20. What happens if a revoked session is reused?

The middleware checks `revoked_at`:
```javascript
if (session.revoked_at) {
  return 401; // Session was revoked (logged out)
}
```

Even if someone captured the session ID before logout, it's permanently invalid after revocation.

---

## Deployment & Improvements

### 21. How would you deploy this securely?

1. **HTTPS everywhere** — TLS termination via nginx/Cloudflare
2. **Set `Secure: true`** on cookies (production already does this)
3. **Strong `COOKIE_SECRET`** — at least 64 random bytes
4. **Separate database server** — not on the same machine
5. **Environment-specific .env** — never commit secrets
6. **Docker containers** — consistent deployment
7. **Monitoring** — alert on unusual login failure patterns
8. **Database backups** — encrypted, tested regularly

### 22. What would you improve with more time?

1. **File upload endpoint** with content validation
2. **Password reset** via email
3. **Email verification** on registration
4. **Refresh tokens** or sliding session expiry
5. **Session binding** to IP/User-Agent
6. **Expired session cleanup** cron job
7. **CSRF tokens** for form-based endpoints
8. **Audit logging** for compliance
9. **2FA** (TOTP or WebAuthn)
10. **Account deletion** for GDPR compliance
