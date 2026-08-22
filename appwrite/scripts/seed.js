/**
 * seed.js — Appwrite Seed Script
 *
 * Creates 3 test accounts and seeds file metadata documents with
 * per-user permissions. Each user can only read/write their own documents.
 *
 * Prerequisites:
 *   1. Run setup.js first
 *   2. Ensure appwrite/.env is configured
 *
 * Usage: node appwrite/scripts/seed.js
 *
 * NOTE: Appwrite handles password hashing automatically — we never see
 * or store the raw password server-side.
 */

const { Client, Users, Databases, Storage, Permission, Role, ID, Query } = require('node-appwrite');
const { InputFile } = require('node-appwrite/file');
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_FILES_COLLECTION_ID,
  APPWRITE_BUCKET_ID,
} = process.env;

const SEED_USERS = [
  {
    email: 'alice@example.com',
    password: 'Password123!',
    name: 'Alice Nakamura',
    files: [
      { fileName: 'resume_alice.pdf', mimeType: 'application/pdf', sizeBytes: 84213 },
      { fileName: 'profile_photo.jpg', mimeType: 'image/jpeg', sizeBytes: 231044 },
    ],
  },
  {
    email: 'bob@example.com',
    password: 'Password123!',
    name: 'Bob Alvarez',
    files: [
      { fileName: 'project_notes.txt', mimeType: 'text/plain', sizeBytes: 5210 },
      { fileName: 'invoice_march.pdf', mimeType: 'application/pdf', sizeBytes: 62890 },
    ],
  },
  {
    email: 'carol@example.com',
    password: 'Password123!',
    name: 'Carol Whitfield',
    files: [
      { fileName: 'test_plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 41200 },
      { fileName: 'vacation.png', mimeType: 'image/png', sizeBytes: 512300 },
    ],
  },
];

async function seed() {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

  const users     = new Users(client);
  const databases = new Databases(client);
  const storage   = new Storage(client);

  for (const userData of SEED_USERS) {
    let userId;

    // ── Create User Account ─────────────────────────────

    try {
      const user = await users.create(
        ID.unique(),
        userData.email,
        undefined, // phone
        userData.password,
        userData.name
      );
      userId = user.$id;
      console.log(`✓ Created user: ${userData.email} (${userId})`);
    } catch (err) {
      if (err.code === 409) {
        // User already exists — find them
        const userList = await users.list([Query.equal('email', [userData.email])]);
        if (userList.users.length > 0) {
          userId = userList.users[0].$id;
          console.log(`ⓘ User already exists: ${userData.email} (${userId})`);
        } else {
          console.error(`✗ Could not find existing user: ${userData.email}`);
          continue;
        }
      } else {
        console.error(`✗ Failed to create user ${userData.email}:`, err.message);
        continue;
      }
    }

    // ── Create File Metadata Documents ──────────────────

    for (const fileData of userData.files) {
      try {
        // Upload a sample file to Storage with per-user permissions
        const sampleContent = `Sample file: ${fileData.fileName}\nOwner: ${userData.email}\nType: ${fileData.mimeType}\n`;
        const tmpPath = path.join(__dirname, '..', `temp_${fileData.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        fs.writeFileSync(tmpPath, sampleContent);

        let storageFileId = '';
        try {
          const uploaded = await storage.createFile(
            APPWRITE_BUCKET_ID,
            ID.unique(),
            InputFile.fromPath(tmpPath, fileData.fileName),
            [
              Permission.read(Role.user(userId)),
              Permission.update(Role.user(userId)),
              Permission.delete(Role.user(userId)),
            ]
          );
          storageFileId = uploaded.$id;
          console.log(`  ✓ Uploaded file to storage: ${fileData.fileName} (${storageFileId})`);
        } catch (uploadErr) {
          console.warn(`  ⚠ Storage upload failed for ${fileData.fileName}: ${uploadErr.message}`);
        }

        // Clean up temp file
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

        // Create the file metadata document with per-user permissions
        // CRITICAL: Only the owner can read/update/delete this document
        await databases.createDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_FILES_COLLECTION_ID,
          ID.unique(),
          {
            ownerId:       userId,
            fileName:      fileData.fileName,
            mimeType:      fileData.mimeType,
            sizeBytes:     fileData.sizeBytes,
            storageFileId: storageFileId,
          },
          [
            Permission.read(Role.user(userId)),
            Permission.update(Role.user(userId)),
            Permission.delete(Role.user(userId)),
          ]
        );

        console.log(`  ✓ Created file document: ${fileData.fileName}`);
      } catch (err) {
        console.warn(`  ⚠ Failed to create file ${fileData.fileName}: ${err.message}`);
      }
    }
  }

  console.log('\n✅ Appwrite seed complete!');
  console.log('\nTest accounts:');
  console.log('  alice@example.com / Password123!');
  console.log('  bob@example.com   / Password123!');
  console.log('  carol@example.com / Password123!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
