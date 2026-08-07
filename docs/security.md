# Security Documentation & Threat Model

## Security Controls Summary

| Control | Layer | Implementation |
|---------|-------|----------------|
| Password hashing | Service | bcrypt, cost factor 12 |
| Session management | Service + DB | Crypto random IDs, SHA-256 hashed in DB |
| Session cookies | Controller | HttpOnly, SameSite=Lax, Secure (prod) |
| Session expiry | Middleware | 24-hour TTL, checked on every request |
| Session revocation | Service | `revoked_at` timestamp in sessions table |
| Rate limiting (IP) | Middleware | express-rate-limit, 10 req/15min on /login |
| Rate limiting (account) | Service + DB | 5 failures → 5min lockout via login_attempts table |
| Security headers | Middleware | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| CORS | Middleware | Explicit origin whitelist, credentials mode |
| SQL injection | All DB queries | Parameterized queries ($1, $2) — never string concatenation |
| IDOR prevention | Service | All file queries include `AND user_id = $authenticated_user_id` |
| Path traversal | Controller | Resolved path validated against uploads directory |
| Input validation | Controller | Email format, password policy (8+ chars, mixed case + digit) |
| Generic errors | Controller | "Invalid email or password" — never reveals which field failed |
| Error handling | Middleware | Centralized handler strips stack traces in production |
| Logging | Utils | Winston — never logs passwords, tokens, or secrets |
| Secrets management | Config | .env files, .gitignore, .env.example templates |
| Request size limits | App | express.json({ limit: '1mb' }) |

---

## Threat Model

### 1. Brute Force Login

**Threat:** Attacker tries thousands of password combinations against a known email.

**Mitigations:**
- IP-based rate limiting: 10 login attempts per 15 minutes per IP
- Account-based lockout: 5 consecutive failures → 5-minute lockout
- Strong password policy at registration (8+ chars, mixed case, digit)

**Remaining risk:** Distributed attacks from many IPs. Mitigation: deploy behind Cloudflare/WAF with additional rate limiting.

---

### 2. Credential Stuffing

**Threat:** Attacker uses leaked username/password pairs from other breaches.

**Mitigations:**
- Same rate limiting as brute force
- bcrypt hashing means even if our DB is breached, passwords aren't plaintext
- Generic login errors prevent confirmation of valid emails

**Remaining risk:** Users who reuse passwords from breached services. Mitigation: add haveibeenpwned API check at registration.

---

### 3. Account Enumeration

**Threat:** Attacker determines which emails are registered by observing different error messages.

**Mitigations:**
- Login always returns "Invalid email or password" regardless of whether the email exists
- Timing-safe: when email is not found, we still run `bcrypt.hash()` to equalize response time
- Registration returns 409 for duplicate emails (acceptable trade-off — most apps do this)

**Remaining risk:** Registration endpoint reveals email existence. Mitigation: could add CAPTCHA or rate-limit registration.

---

### 4. Stolen Session / Session Hijacking

**Threat:** Attacker obtains a valid session ID through XSS, network sniffing, or physical access.

**Mitigations:**
- HttpOnly cookies: JavaScript cannot read the session cookie (XSS can't steal it)
- SameSite=Lax: cookie not sent in cross-origin requests (CSRF mitigation)
- Secure flag in production: cookie only sent over HTTPS
- 24-hour expiry: limits window of opportunity
- Logout revokes session server-side

**Remaining risk:** Man-in-the-middle on HTTP in development. Mitigation: always use HTTPS in production.

---

### 5. Session Replay

**Threat:** Attacker captures a valid session ID and replays it.

**Mitigations:**
- Sessions are bound to user_id in the database
- Sessions have expiry (24h)
- Logout revokes the session — replayed tokens fail
- SHA-256 hash in DB means leaked DB data can't be used for replay

**Remaining risk:** Active replay during valid session window. Mitigation: bind session to IP/User-Agent (trade-off with usability).

---

### 6. Insecure Direct Object Reference (IDOR)

**Threat:** User A modifies a file ID in the URL to access User B's file.

**Mitigations:**
- **All file queries include ownership check:**
  ```sql
  SELECT * FROM files WHERE id = $1 AND user_id = $2
  ```
- User ID comes from the validated session, never from request parameters
- GET /files/:id returns 403 if file exists but belongs to another user
- GET /files returns only the authenticated user's files

**Remaining risk:** None for file access — the SQL query is the enforcement point.

---

### 7. Unauthorized File Access

**Threat:** Unauthenticated user or wrong user accesses file content.

**Mitigations:**
- All file endpoints require authentication (middleware)
- Download endpoint verifies ownership before streaming
- Files stored with safe UUID-based filenames (no user-controlled paths)

**Remaining risk:** None — authorization is enforced at both middleware and service layers.

---

### 8. SQL Injection

**Threat:** Attacker injects SQL through input fields.

**Mitigations:**
- All database queries use parameterized placeholders ($1, $2, ...)
- pg library handles escaping
- No string concatenation in SQL construction anywhere in the codebase

**Remaining risk:** Effectively zero for parameterized queries. Future code changes must maintain this discipline.

---

### 9. Path Traversal

**Threat:** Attacker manipulates file paths to read arbitrary files from the server.

**Mitigations:**
- Files are stored with server-generated UUID filenames, not user-supplied names
- Download handler resolves the path and verifies it starts with the uploads directory
- Original filenames are stored in the database only, never used as disk paths
- `path.resolve()` + `startsWith(uploadsDir)` check

**Remaining risk:** None for current implementation. If upload is added, same controls apply.

---

### 10. Malicious File Upload

**Threat:** Attacker uploads executable or malicious files.

**Current status:** File upload is not implemented (files are seeded).

**If implemented, mitigations would include:**
- File size limits
- MIME type validation
- Store outside web root
- Generate random filenames
- Never execute uploaded files
- Virus scanning for production

---

### 11. Leaked Environment Variables

**Threat:** Secrets committed to Git or exposed in error messages.

**Mitigations:**
- `.env` in `.gitignore`
- `.env.example` contains no real secrets
- Error handler strips internal details in production
- Logger never logs passwords, tokens, or API keys

**Remaining risk:** Developer accidentally commits `.env`. Mitigation: pre-commit hooks.

---

### 12. Insecure CORS

**Threat:** Malicious site makes authenticated requests to our API.

**Mitigations:**
- Explicit origin whitelist (not `*`)
- `credentials: true` only for whitelisted origins
- SameSite=Lax on session cookies

**Remaining risk:** If a whitelisted origin is compromised. Mitigation: minimize allowed origins.

---

### 13. Insecure Cookies

**Threat:** Session cookie stolen or tampered with.

**Mitigations:**
- HttpOnly: true — JS can't read it
- SameSite: Lax — prevents CSRF from other origins
- Secure: true in production — HTTPS only
- Cookie value is a random token, not user data
- Server stores only the hash, not the raw cookie value

**Remaining risk:** HTTP in development (Secure=false). Acceptable for local dev.

---

## Appwrite Security Model

Appwrite provides many security controls automatically:

| Threat | Appwrite Mitigation |
|--------|-------------------|
| Brute force | Built-in rate limiting |
| Password storage | Argon2id (automatic) |
| Session management | Secure cookies, server-side |
| IDOR | Document-level permissions |
| File access | File-level permissions |
| SQL injection | Not applicable (SDK) |
| CORS | Configured per project |

**We configure:**
- `documentSecurity: true` on collections
- Per-document `Permission.read(Role.user(ownerId))` — only owner can read
- Per-file `Permission.read(Role.user(ownerId))` — only owner can download
- No collection-level or bucket-level read permissions
