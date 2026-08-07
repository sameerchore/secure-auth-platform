/**
 * auth.test.js — Comprehensive test suite for the Secure Login System.
 *
 * Uses server-side sessions (not JWT). Tests use Bearer token headers
 * (the session ID) since Supertest doesn't natively support cookies
 * across requests. The auth middleware accepts both cookies and Bearer.
 *
 * Tests cover:
 *   1.  Registration (success + validation)
 *   2.  Duplicate registration rejection
 *   3.  Login with correct credentials
 *   4.  Login with wrong password (generic error)
 *   5.  Login with unknown email (same generic error)
 *   6.  Passwords are hashed (bcrypt)
 *   7.  Protected endpoint rejects unauthenticated requests
 *   8.  /me returns current user only
 *   9.  /me cannot be manipulated to return another user
 *   10. /files returns only current user's files
 *   11. User A cannot access User B's file (IDOR)
 *   12. User B cannot access User A's file (IDOR)
 *   13. Nonexistent file handled correctly
 *   14. Logout invalidates server-side session
 *   15. Old session cannot access protected endpoints after logout
 *   16. Rate limiting (account lockout)
 *   17. Expired/revoked sessions fail
 *   18. Cross-user security matrix
 */
const request = require('supertest');
const app     = require('../src/app');
const { pool, query } = require('../src/config/db');
const fs   = require('fs');
const path = require('path');

// ── Test Data ─────────────────────────────────────────────

const USER_A = { email: 'test_alice@example.com', password: 'Password123!' };
const USER_B = { email: 'test_bob@example.com',   password: 'Password456!' };
const USER_C = { email: 'test_carol@example.com', password: 'Password789!' };

let tokenA, tokenB, tokenC;
let userAId, userBId, userCId;
let fileAId, fileBId, fileCId;

// ── Setup / Teardown ──────────────────────────────────────

beforeAll(async () => {
  // Run schema (idempotent)
  const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await query(schema);

  // Clean test data
  await query("DELETE FROM login_attempts WHERE email LIKE 'test_%'");
  await query("DELETE FROM files WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_%')");
  await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_%')");
  await query("DELETE FROM users WHERE email LIKE 'test_%'");
});

afterAll(async () => {
  // Clean up test data
  await query("DELETE FROM login_attempts WHERE email LIKE 'test_%'");
  await query("DELETE FROM files WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_%')");
  await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_%')");
  await query("DELETE FROM users WHERE email LIKE 'test_%'");
  await pool.end();
});

// ── 1. Registration ──────────────────────────────────────

describe('POST /register', () => {
  test('1. Registration works', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: USER_A.email, password: USER_A.password });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(USER_A.email);
    userAId = res.body.id;
  });

  test('1b. Register User B', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: USER_B.email, password: USER_B.password });

    expect(res.status).toBe(201);
    userBId = res.body.id;
  });

  test('1c. Register User C', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: USER_C.email, password: USER_C.password });

    expect(res.status).toBe(201);
    userCId = res.body.id;
  });

  test('2. Duplicate registration is rejected safely', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: USER_A.email, password: USER_A.password });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  test('Registration rejects invalid email', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: 'not-an-email', password: 'Password123!' });

    expect(res.status).toBe(400);
  });

  test('Registration rejects weak password', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: 'test_weak@example.com', password: 'abc' });

    expect(res.status).toBe(400);
  });
});

// ── 3-5. Login ────────────────────────────────────────────

describe('POST /login', () => {
  test('3. Login with correct credentials works', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: USER_A.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe(USER_A.email);
    tokenA = res.body.token;

    // Should also set an HttpOnly cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sidCookie = cookies.find(c => c.startsWith('sid='));
    expect(sidCookie).toBeDefined();
    expect(sidCookie).toMatch(/HttpOnly/i);
  });

  test('3b. Login User B', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_B.email, password: USER_B.password });

    expect(res.status).toBe(200);
    tokenB = res.body.token;
  });

  test('3c. Login User C', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_C.email, password: USER_C.password });

    expect(res.status).toBe(200);
    tokenC = res.body.token;
  });

  test('4. Login with wrong password fails with generic error', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: 'WrongPassword99!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    // Must NOT reveal "incorrect password"
    expect(res.body.error).not.toMatch(/incorrect password/i);
    expect(res.body.error).not.toMatch(/wrong password/i);
  });

  test('5. Login with unknown email returns the SAME generic error', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'test_nonexistent@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    // Must NOT reveal "email not registered"
    expect(res.body.error).not.toMatch(/not registered/i);
    expect(res.body.error).not.toMatch(/not found/i);
  });

  test('Login with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_A.email });

    expect(res.status).toBe(400);
  });
});

// ── 6. Password Hashing ──────────────────────────────────

describe('Password security', () => {
  test('6. Passwords are hashed with bcrypt (not stored in plaintext)', async () => {
    const result = await query(
      'SELECT password_hash FROM users WHERE email = $1',
      [USER_A.email]
    );

    const hash = result.rows[0].password_hash;
    expect(hash).toBeDefined();
    // bcrypt hashes start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
    // Hash is not the plaintext password
    expect(hash).not.toBe(USER_A.password);
  });
});

// ── 7. Protected Endpoints ───────────────────────────────

describe('Authentication middleware', () => {
  test('7a. /me rejects unauthenticated requests', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  test('7b. /files rejects unauthenticated requests', async () => {
    const res = await request(app).get('/files');
    expect(res.status).toBe(401);
  });

  test('7c. /files/:id rejects unauthenticated requests', async () => {
    const res = await request(app).get('/files/some-id');
    expect(res.status).toBe(401);
  });

  test('7d. Invalid token is rejected', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', 'Bearer invalid-session-id-here');

    expect(res.status).toBe(401);
  });

  test('7e. Malformed Authorization header is rejected', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', 'NotBearer somevalue');

    expect(res.status).toBe(401);
  });
});

// ── 8-9. /me Isolation ───────────────────────────────────

describe('GET /me', () => {
  test('8. Returns current user profile', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USER_A.email);
    expect(res.body.id).toBe(userAId);
    expect(res.body).toHaveProperty('profile');
  });

  test('9. Cannot be manipulated to return another user via query param', async () => {
    const res = await request(app)
      .get(`/me?userId=${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USER_A.email);
    expect(res.body.id).toBe(userAId);
    // Must NOT return User B's data
    expect(res.body.email).not.toBe(USER_B.email);
  });
});

// ── 10-13. File Isolation ─────────────────────────────────

describe('File access and IDOR prevention', () => {
  // Seed files for each test user
  beforeAll(async () => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const usersAndLabels = [
      [userAId, 'alice', 'A'],
      [userBId, 'bob', 'B'],
      [userCId, 'carol', 'C'],
    ];

    for (const [userId, name, label] of usersAndLabels) {
      const filename = `test_file_${label}_${Date.now()}.txt`;
      const diskPath = path.join(uploadsDir, filename);
      const content = `Test file for ${name}`;
      fs.writeFileSync(diskPath, content);
      const stat = fs.statSync(diskPath);

      const result = await query(
        `INSERT INTO files (user_id, filename, original_filename, storage_path, mime_type, size)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, filename, `${name}_document.txt`, `uploads/${filename}`, 'text/plain', stat.size]
      );

      if (label === 'A') fileAId = result.rows[0].id;
      if (label === 'B') fileBId = result.rows[0].id;
      if (label === 'C') fileCId = result.rows[0].id;
    }
  });

  test('10. /files returns only current user\'s files', async () => {
    const res = await request(app)
      .get('/files')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.files).toBeDefined();
    expect(Array.isArray(res.body.files)).toBe(true);

    // All returned files must belong to User A
    for (const file of res.body.files) {
      expect(file.ownerId).toBe(userAId);
    }

    // User B's and C's files must NOT appear
    const fileIds = res.body.files.map(f => f.id);
    expect(fileIds).not.toContain(fileBId);
    expect(fileIds).not.toContain(fileCId);
  });

  test('User A can access their own file', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.file).toBeDefined();
    expect(res.body.file.id).toBe(fileAId);
  });

  test('11. User A cannot access User B\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([403, 404]).toContain(res.status);
  });

  test('12. User B cannot access User A\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect([403, 404]).toContain(res.status);
  });

  test('11b. User A cannot download User B\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileBId}/download`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([403, 404]).toContain(res.status);
  });

  test('13. Nonexistent file returns 404', async () => {
    const res = await request(app)
      .get('/files/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('User A can download their own file', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}/download`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
  });
});

// ── 14-15. Logout and Session Invalidation ────────────────

describe('Logout and session invalidation', () => {
  let logoutToken;

  beforeAll(async () => {
    // Create a fresh session for logout testing
    const res = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: USER_A.password });
    logoutToken = res.body.token;
  });

  test('14. Logout invalidates server-side session', async () => {
    // Verify token works before logout
    const beforeRes = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${logoutToken}`);
    expect(beforeRes.status).toBe(200);

    // Logout
    const logoutRes = await request(app)
      .post('/logout')
      .set('Authorization', `Bearer ${logoutToken}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Logged out');

    // Should clear the cookie
    const cookies = logoutRes.headers['set-cookie'];
    if (cookies) {
      const sidCookie = cookies.find(c => c.startsWith('sid='));
      if (sidCookie) {
        // Cookie should be cleared (empty value or expired)
        expect(sidCookie).toMatch(/sid=;|Expires=Thu, 01 Jan 1970/i);
      }
    }
  });

  test('15. Old session cannot access protected endpoints after logout', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${logoutToken}`);

    expect(res.status).toBe(401);
  });

  test('15b. Old session cannot list files after logout', async () => {
    const res = await request(app)
      .get('/files')
      .set('Authorization', `Bearer ${logoutToken}`);

    expect(res.status).toBe(401);
  });

  test('15c. Old session cannot access individual file after logout', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}`)
      .set('Authorization', `Bearer ${logoutToken}`);

    expect(res.status).toBe(401);
  });
});

// ── 16. Rate Limiting / Account Lockout ───────────────────

describe('Rate limiting / account lockout', () => {
  const LOCKOUT_EMAIL = 'test_lockout@example.com';

  beforeAll(async () => {
    await request(app)
      .post('/register')
      .send({ email: LOCKOUT_EMAIL, password: 'Password123!' });
  });

  afterAll(async () => {
    await query("DELETE FROM login_attempts WHERE email = $1", [LOCKOUT_EMAIL]);
    await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [LOCKOUT_EMAIL]);
    await query("DELETE FROM users WHERE email = $1", [LOCKOUT_EMAIL]);
  });

  test('16. Repeated failed login attempts trigger lockout', async () => {
    // Send multiple failed login attempts (exceed LOCKOUT_THRESHOLD=5)
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/login')
        .send({ email: LOCKOUT_EMAIL, password: 'WrongPassword!' });
    }

    // Next attempt should be rate-limited (429)
    const res = await request(app)
      .post('/login')
      .send({ email: LOCKOUT_EMAIL, password: 'WrongPassword!' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many/i);
  });
});

// ── 17. Session Lifecycle ─────────────────────────────────

describe('Session lifecycle', () => {
  test('17. Manually revoked session is rejected', async () => {
    // Login to get a session
    const loginRes = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: USER_A.password });
    const sessionToken = loginRes.body.token;

    // Verify it works
    const meRes = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(meRes.status).toBe(200);

    // Manually revoke all sessions for this user via DB
    await query(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1",
      [userAId]
    );

    // Revoked session must be rejected
    const revokedRes = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(revokedRes.status).toBe(401);
  });
});

// ── Cross-User Security Matrix ────────────────────────────

describe('Security Test Matrix', () => {
  beforeAll(async () => {
    // Re-login all users (previous tests may have revoked sessions)
    const resA = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: USER_A.password });
    tokenA = resA.body.token;

    const resB = await request(app)
      .post('/login')
      .send({ email: USER_B.email, password: USER_B.password });
    tokenB = resB.body.token;

    const resC = await request(app)
      .post('/login')
      .send({ email: USER_C.email, password: USER_C.password });
    tokenC = resC.body.token;
  });

  test('User A gets A\'s profile', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USER_A.email);
  });

  test('User B gets B\'s profile', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USER_B.email);
  });

  test('User C gets C\'s profile', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USER_C.email);
  });

  test('User A cannot access User B\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect([403, 404]).toContain(res.status);
  });

  test('User B cannot access User A\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(res.status);
  });

  test('User A cannot access User C\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileCId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect([403, 404]).toContain(res.status);
  });

  test('User C cannot access User A\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileAId}`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect([403, 404]).toContain(res.status);
  });

  test('User B cannot access User C\'s file', async () => {
    const res = await request(app)
      .get(`/files/${fileCId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(res.status);
  });

  test('No auth → /me returns 401', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  test('No auth → /files returns 401', async () => {
    const res = await request(app).get('/files');
    expect(res.status).toBe(401);
  });

  test('No auth → /files/:id returns 401', async () => {
    const res = await request(app).get(`/files/${fileAId}`);
    expect(res.status).toBe(401);
  });

  test('Wrong email + password → generic error', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'test_nobody@example.com', password: 'Wrong123!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('Correct email + wrong password → same generic error', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: USER_A.email, password: 'WrongPass999!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('Logout then reuse old credential → 401', async () => {
    // Fresh login
    const loginRes = await request(app)
      .post('/login')
      .send({ email: USER_B.email, password: USER_B.password });
    const oldToken = loginRes.body.token;

    // Logout
    await request(app)
      .post('/logout')
      .set('Authorization', `Bearer ${oldToken}`);

    // Reuse old credential
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(res.status).toBe(401);
  });
});
