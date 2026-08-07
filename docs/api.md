# API Documentation

Base URL: `http://localhost:3000`

All endpoints accept and return `application/json` unless noted.

Authentication is via:
1. **HttpOnly cookie** (`sid`) — set automatically on login
2. **Bearer token** — `Authorization: Bearer <sessionId>` (for testing)

---

## POST /register

Create a new user account.

**Authentication:** None required

**Request Body:**
```json
{
  "email": "alice@example.com",
  "password": "Password123!",
  "name": "Alice Nakamura"       // optional
}
```

**Success Response (201 Created):**
```json
{
  "id": "uuid-here",
  "email": "alice@example.com"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid email | `{ "error": "A valid email is required" }` |
| 400 | Weak password | `{ "error": "Password must be at least 8 characters. ..." }` |
| 409 | Email exists | `{ "error": "An account with that email already exists" }` |

**Security Notes:**
- Password is hashed with bcrypt (cost 12) before storage
- Plaintext password is never logged or stored

---

## POST /login

Authenticate and create a session.

**Authentication:** None required (rate-limited)

**Request Body:**
```json
{
  "email": "alice@example.com",
  "password": "Password123!"
}
```

**Success Response (200 OK):**
```json
{
  "token": "hex-session-id",
  "user": {
    "id": "uuid-here",
    "email": "alice@example.com"
  }
}
```

Also sets `Set-Cookie: sid=<sessionId>; HttpOnly; SameSite=Lax; Path=/`

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing fields | `{ "error": "Email and password are required" }` |
| 401 | Wrong email OR wrong password | `{ "error": "Invalid email or password" }` |
| 429 | Account locked out | `{ "error": "Too many failed attempts. Try again later." }` |

**Security Notes:**
- Same generic error for wrong email and wrong password (prevents account enumeration)
- Rate limited: 10 attempts per 15 minutes per IP
- Account lockout: 5 consecutive failures → 5 minute lockout
- Constant-time bcrypt comparison even for non-existent emails

---

## POST /logout

Revoke the current session server-side and clear the cookie.

**Authentication:** Required

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "message": "Logged out"
}
```

Also clears the `sid` cookie.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |

**Security Notes:**
- Session is revoked in the database (`revoked_at = NOW()`)
- The old session ID will return 401 on any subsequent request
- This is NOT just client-side token deletion

---

## GET /me

Get the authenticated user's profile.

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "id": "uuid-here",
  "email": "alice@example.com",
  "profile": {
    "fullName": "Alice Nakamura",
    "displayName": "alice",
    "bio": "Product designer who likes clean UIs.",
    "createdAt": "2025-01-14T09:32:00.000Z",
    "role": "user"
  }
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |

**Security Notes:**
- User identity comes from the validated session, NOT from query parameters
- `GET /me?userId=other-user-id` is ignored — always returns the authenticated user
- Never returns password_hash

---

## GET /files

List all files belonging to the authenticated user.

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "files": [
    {
      "id": "uuid-here",
      "ownerId": "user-uuid",
      "fileName": "resume_alice.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 84213,
      "uploadedAt": "2025-01-15T10:02:00.000Z"
    }
  ]
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |

**Security Notes:**
- SQL query filters by `WHERE user_id = authenticated_user_id`
- Never returns files belonging to other users
- Does not accept a userId parameter

---

## GET /files/:id

Get metadata for a single file.

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "file": {
    "id": "uuid-here",
    "ownerId": "user-uuid",
    "fileName": "resume_alice.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 84213,
    "uploadedAt": "2025-01-15T10:02:00.000Z"
  }
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |
| 403 | File belongs to another user | `{ "error": "You do not have access to this file" }` |
| 404 | File does not exist | `{ "error": "File not found" }` |

**Security Notes:**
- Ownership verified via `WHERE id = $1 AND user_id = $2`
- 403 vs 404 distinction: 403 = file exists but you don't own it; 404 = file doesn't exist at all
- This prevents IDOR attacks

---

## GET /files/:id/download

Download the actual file content.

**Authentication:** Required

**Success Response (200 OK):**
- Content-Type: file's MIME type
- Content-Disposition: `attachment; filename="original_name.ext"`
- Body: file binary stream

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `Not authenticated` |
| 403 | File belongs to another user | `Forbidden` |
| 404 | File not found | `File not found` |

**Security Notes:**
- Same ownership check as GET /files/:id
- Path traversal protection: resolved path checked against uploads directory
- Files stored with UUID filenames, not user-supplied names

---

## GET /health

Health check endpoint.

**Authentication:** None required

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```
