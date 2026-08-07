# Architecture

## System Overview

The Secure Auth Platform is implemented twice — a custom backend and an Appwrite-managed backend — both serving the same testing client (`index.html`).

## Custom Backend Architecture

### Layered Architecture

```
┌──────────────────────────────────────────────────┐
│                   CLIENT                          │
│              (index.html)                         │
└──────────────────────┬───────────────────────────┘
                       │  HTTP (JSON + Cookies)
                       ▼
┌──────────────────────────────────────────────────┐
│              EXPRESS APPLICATION                  │
│                                                   │
│  ┌─────────┐ ┌──────┐ ┌────────┐ ┌────────────┐ │
│  │ Helmet  │ │ CORS │ │ Cookie │ │ Rate Limit │ │
│  │ Headers │ │      │ │ Parser │ │  (Global)  │ │
│  └────┬────┘ └──┬───┘ └───┬────┘ └─────┬──────┘ │
│       └─────────┴─────────┴─────────────┘         │
│                       │                            │
│  ┌────────────────────┴───────────────────────┐   │
│  │               ROUTER LAYER                  │   │
│  │  /register  /login  /logout  /me  /files    │   │
│  └────────────────────┬───────────────────────┘   │
│                       │                            │
│  ┌────────────────────┴───────────────────────┐   │
│  │          AUTH MIDDLEWARE                     │   │
│  │  Extract session ID (cookie → bearer)       │   │
│  │  Hash → lookup in sessions table            │   │
│  │  Verify not expired / not revoked           │   │
│  │  Load user → attach to req.user             │   │
│  └────────────────────┬───────────────────────┘   │
│                       │                            │
│  ┌────────────────────┴───────────────────────┐   │
│  │            CONTROLLER LAYER                 │   │
│  │  Validate input                             │   │
│  │  Call service                               │   │
│  │  Format response                            │   │
│  │  Set/clear cookies                          │   │
│  └────────────────────┬───────────────────────┘   │
│                       │                            │
│  ┌────────────────────┴───────────────────────┐   │
│  │            SERVICE LAYER                    │   │
│  │  auth.service.js  — hashing, sessions       │   │
│  │  user.service.js  — user profile queries     │   │
│  │  file.service.js  — file queries + ownership │   │
│  └────────────────────┬───────────────────────┘   │
│                       │                            │
└───────────────────────┼────────────────────────────┘
                        │  Parameterized SQL
                        ▼
┌──────────────────────────────────────────────────┐
│                 POSTGRESQL                        │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  users   │ │ sessions │ │  files   │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │             │            │                 │
│  ┌────┴─────────────┴────────────┴──────────┐     │
│  │           login_attempts                  │     │
│  └───────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

### Data Model

```
┌──────────────────┐
│      USERS       │
│──────────────────│
│ id (UUID PK)     │
│ email (UNIQUE)   │
│ password_hash    │──── bcrypt cost 12
│ full_name        │
│ display_name     │
│ bio              │
│ role             │
│ created_at       │
│ updated_at       │
└───────┬──────────┘
        │ 1
        │
        ├──────────────────┐
        │ N                │ N
┌───────┴──────────┐ ┌────┴─────────────┐
│    SESSIONS      │ │     FILES        │
│──────────────────│ │──────────────────│
│ id (UUID PK)     │ │ id (UUID PK)     │
│ user_id (FK)     │ │ user_id (FK)     │
│ token_hash       │ │ filename         │
│   (SHA-256)      │ │ original_filename│
│ expires_at       │ │ storage_path     │
│ revoked_at       │ │ mime_type        │
│ created_at       │ │ size             │
└──────────────────┘ │ created_at       │
                     └──────────────────┘
```

### Session Flow

```
LOGIN:
  Client                    Server                     Database
    │                         │                           │
    │  POST /login            │                           │
    │  {email, password}      │                           │
    │ ───────────────────────>│                           │
    │                         │  SELECT user by email     │
    │                         │ ──────────────────────────>│
    │                         │  bcrypt.compare()         │
    │                         │                           │
    │                         │  crypto.randomBytes(32)   │
    │                         │  sessionId = hex          │
    │                         │  tokenHash = SHA256(sid)  │
    │                         │                           │
    │                         │  INSERT INTO sessions     │
    │                         │  (user_id, token_hash,    │
    │                         │   expires_at)             │
    │                         │ ──────────────────────────>│
    │                         │                           │
    │  Set-Cookie: sid=<raw>  │                           │
    │  {token, user}          │                           │
    │ <───────────────────────│                           │


PROTECTED REQUEST:
  Client                    Server                     Database
    │                         │                           │
    │  GET /me                │                           │
    │  Cookie: sid=<raw>      │                           │
    │ ───────────────────────>│                           │
    │                         │  tokenHash = SHA256(sid)  │
    │                         │  SELECT session           │
    │                         │  WHERE token_hash = ?     │
    │                         │ ──────────────────────────>│
    │                         │  Check: not revoked       │
    │                         │  Check: not expired       │
    │                         │                           │
    │                         │  SELECT user              │
    │                         │  WHERE id = session.uid   │
    │                         │ ──────────────────────────>│
    │                         │                           │
    │  200 {id, email, ...}   │                           │
    │ <───────────────────────│                           │


LOGOUT:
  Client                    Server                     Database
    │                         │                           │
    │  POST /logout           │                           │
    │  Cookie: sid=<raw>      │                           │
    │ ───────────────────────>│                           │
    │                         │  UPDATE sessions          │
    │                         │  SET revoked_at = NOW()   │
    │                         │  WHERE token_hash = ?     │
    │                         │ ──────────────────────────>│
    │                         │                           │
    │  Clear-Cookie: sid=     │                           │
    │  {message: "Logged out"}│                           │
    │ <───────────────────────│                           │
```

## Appwrite Architecture

```
┌──────────────────────────────────────────────────┐
│                   CLIENT                          │
│        (index.html + appwrite-adapter.js)         │
└──────────────────────┬───────────────────────────┘
                       │  Appwrite Web SDK
                       ▼
┌──────────────────────────────────────────────────┐
│           APPWRITE CLOUD / SELF-HOSTED            │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Accounts │ │ Database │ │ Storage          │  │
│  │ Service  │ │ Service  │ │ Service          │  │
│  │          │ │          │ │                  │  │
│  │ - create │ │ - files  │ │ - user-files     │  │
│  │ - login  │ │   coll.  │ │   bucket         │  │
│  │ - logout │ │          │ │                  │  │
│  │ - get()  │ │ Per-doc  │ │ Per-file         │  │
│  │          │ │ perms    │ │ permissions      │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Key Difference

| Aspect | Custom Backend | Appwrite |
|--------|---------------|----------|
| Auth logic | We write it | Appwrite handles it |
| Session store | Our PostgreSQL table | Appwrite internal |
| Data isolation | SQL WHERE clauses | Permission rules |
| File storage | Local filesystem | Appwrite Storage |
| Rate limiting | Our middleware | Appwrite built-in |
