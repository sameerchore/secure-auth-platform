# Appwrite Implementation

This directory contains the Appwrite-based implementation of the Secure Auth Platform.

## What Appwrite Handles Automatically

| Feature | Appwrite Responsibility |
|---------|------------------------|
| Password hashing | ✅ Automatic (Argon2id server-side) |
| Session management | ✅ Secure cookie-based sessions |
| Account creation | ✅ Email/password accounts API |
| Session revocation | ✅ `deleteSession('current')` |
| Rate limiting | ✅ Built-in per-IP rate limiting |
| Email uniqueness | ✅ Enforced automatically |

## What We Configure

| Feature | Our Responsibility |
|---------|-------------------|
| Database collection schema | Create attributes, indexes |
| Document-level permissions | Set `Permission.read(Role.user(userId))` per document |
| File-level permissions | Set `Permission.read(Role.user(userId))` per file |
| Adapter logic | Map API contract to Appwrite SDK calls |
| Data isolation | Configure `documentSecurity: true` on collection |

## Setup Instructions

### 1. Create Appwrite Project

1. Go to [Appwrite Console](https://cloud.appwrite.io)
2. Create a new project
3. Note the **Project ID**
4. Generate an **API Key** (Settings → API Keys) with all scopes enabled

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Appwrite project details
```

### 3. Install Dependencies

```bash
cd appwrite
npm install
```

### 4. Run Setup (creates database, collection, bucket)

```bash
npm run setup
```

### 5. Seed Test Data

```bash
npm run seed
```

### 6. Configure index.html

In the testing client:
1. Select "Appwrite" mode
2. Enter your Appwrite endpoint
3. Enter your Project ID
4. Enter your Database ID (default: `secure_auth_db`)
5. Enter your Files Collection ID (default: `files`)
6. Enter your Bucket ID (default: `user-files`)

### 7. Add Appwrite SDK and Adapter to index.html

Uncomment the Appwrite script tags in `index.html`:

```html
<script src="https://cdn.jsdelivr.net/npm/appwrite@14.0.0"></script>
<script src="appwrite/web/appwrite-adapter.js"></script>
```

## Permission Model

### Document-Level Permissions

Each file metadata document has permissions:
- `Permission.read(Role.user(ownerId))` — only owner can read
- `Permission.update(Role.user(ownerId))` — only owner can update
- `Permission.delete(Role.user(ownerId))` — only owner can delete

This means:
- **User A** can list and read **only their own** file documents
- **User B** cannot see or access **User A's** documents
- Appwrite enforces this at the server level — no frontend filtering

### File-Level Permissions (Storage)

Each uploaded file has the same permission structure:
- Only the owner can read/download the file
- Appwrite returns 404 for unauthorized access attempts

## Test Accounts

| Email | Password |
|-------|----------|
| alice@example.com | Password123! |
| bob@example.com | Password123! |
| carol@example.com | Password123! |

## Security Notes

- The API key is used **only by server-side scripts** (setup/seed), never exposed to the client
- The adapter uses the Appwrite Web SDK, which authenticates via secure cookies
- Document-level security (`documentSecurity: true`) ensures server-enforced isolation
- No collection-level read permissions — users can only access their own documents
