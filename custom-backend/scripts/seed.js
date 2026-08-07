/**
 * seed.js — Populate the database with test users and files.
 *
 * Creates 3 users (alice, bob, carol), each with 2 files.
 * Also creates corresponding sample files on disk in uploads/.
 *
 * Usage: npm run seed
 *
 * IMPORTANT:
 *   - Passwords are hashed with bcrypt before storage.
 *   - This script is idempotent — it clears existing data first.
 *   - The plaintext passwords below are for DEVELOPMENT/TESTING ONLY.
 */
const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');
const { pool, query } = require('../src/config/db');

const BCRYPT_ROUNDS = 12;

const SEED_USERS = [
  {
    email: 'alice@example.com',
    password: 'Password123!',
    fullName: 'Alice Nakamura',
    displayName: 'alice',
    bio: 'Product designer who likes clean UIs.',
    role: 'user',
    files: [
      { originalFilename: 'resume_alice.pdf', mimeType: 'application/pdf', size: 84213 },
      { originalFilename: 'profile_photo.jpg', mimeType: 'image/jpeg', size: 231044 },
    ],
  },
  {
    email: 'bob@example.com',
    password: 'Password123!',
    fullName: 'Bob Alvarez',
    displayName: 'bob',
    bio: 'Backend engineer, coffee enthusiast.',
    role: 'user',
    files: [
      { originalFilename: 'project_notes.txt', mimeType: 'text/plain', size: 5210 },
      { originalFilename: 'invoice_march.pdf', mimeType: 'application/pdf', size: 62890 },
    ],
  },
  {
    email: 'carol@example.com',
    password: 'Password123!',
    fullName: 'Carol Whitfield',
    displayName: 'carol',
    bio: 'QA lead focused on security testing.',
    role: 'user',
    files: [
      { originalFilename: 'test_plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 41200 },
      { originalFilename: 'vacation.png', mimeType: 'image/png', size: 512300 },
    ],
  },
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing data (order matters due to FK constraints)
    await client.query('DELETE FROM login_attempts');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM files');
    await client.query('DELETE FROM users');

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    for (const userData of SEED_USERS) {
      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);

      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, display_name, bio, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userData.email, passwordHash, userData.fullName, userData.displayName, userData.bio, userData.role]
      );
      const userId = userResult.rows[0].id;

      console.log(`  Created user: ${userData.email} (id: ${userId})`);

      // Insert files
      for (const fileData of userData.files) {
        // Generate a safe filename using UUID-style naming
        const ext = path.extname(fileData.originalFilename);
        const safeFilename = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const storagePath = path.join('uploads', safeFilename);

        // Create a sample file on disk
        const diskPath = path.join(uploadsDir, safeFilename);
        const sampleContent = `Sample file: ${fileData.originalFilename}\nOwner: ${userData.email}\nType: ${fileData.mimeType}\nThis is a seeded sample file for testing purposes.\n`;
        fs.writeFileSync(diskPath, sampleContent);

        // Insert file record
        const fileResult = await client.query(
          `INSERT INTO files (user_id, filename, original_filename, storage_path, mime_type, size)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [userId, safeFilename, fileData.originalFilename, storagePath, fileData.mimeType, fileData.size]
        );

        console.log(`    Created file: ${fileData.originalFilename} (id: ${fileResult.rows[0].id})`);
      }
    }

    await client.query('COMMIT');
    console.log('\n[seed] Database seeded successfully!');
    console.log('\nTest accounts:');
    console.log('  alice@example.com / Password123!');
    console.log('  bob@example.com   / Password123!');
    console.log('  carol@example.com / Password123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
