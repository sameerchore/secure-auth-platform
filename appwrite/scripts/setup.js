/**
 * setup.js — Appwrite Project Setup Script
 *
 * Creates the database, collection, and storage bucket needed for the
 * secure auth platform. Run this ONCE to initialize your Appwrite project.
 *
 * Prerequisites:
 *   1. Create an Appwrite project at https://cloud.appwrite.io
 *   2. Generate an API key with full permissions
 *   3. Copy appwrite/.env.example to appwrite/.env and fill in values
 *
 * Usage: node appwrite/scripts/setup.js
 */

const { Client, Databases, Storage, Permission, Role } = require('node-appwrite');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_FILES_COLLECTION_ID,
  APPWRITE_BUCKET_ID,
} = process.env;

async function setup() {
  // Initialize server-side client
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

  const databases = new Databases(client);
  const storage   = new Storage(client);

  // ── 1. Create Database ──────────────────────────────────

  console.log('Creating database...');
  try {
    await databases.create(APPWRITE_DATABASE_ID, 'Secure Auth DB');
    console.log('  ✓ Database created');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ⓘ Database already exists');
    } else {
      throw err;
    }
  }

  // ── 2. Create Files Collection ──────────────────────────

  console.log('Creating files collection...');
  try {
    await databases.createCollection(
      APPWRITE_DATABASE_ID,
      APPWRITE_FILES_COLLECTION_ID,
      'Files',
      [
        // No collection-level permissions — we use document-level permissions
        // so each document is only readable by its owner
      ],
      true // documentSecurity enabled — allows per-document permissions
    );
    console.log('  ✓ Files collection created');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ⓘ Files collection already exists');
    } else {
      throw err;
    }
  }

  // ── 3. Create Collection Attributes ─────────────────────

  console.log('Creating collection attributes...');
  const attributes = [
    { method: 'createStringAttribute', args: [APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, 'ownerId', 36, true] },
    { method: 'createStringAttribute', args: [APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, 'fileName', 255, true] },
    { method: 'createStringAttribute', args: [APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, 'mimeType', 100, false, 'application/octet-stream'] },
    { method: 'createIntegerAttribute', args: [APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, 'sizeBytes', false, 0, 10737418240, 0] },
    { method: 'createStringAttribute', args: [APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, 'storageFileId', 36, false, ''] },
  ];

  for (const attr of attributes) {
    try {
      await databases[attr.method](...attr.args);
      console.log(`  ✓ Attribute '${attr.args[2]}' created`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`  ⓘ Attribute '${attr.args[2]}' already exists`);
      } else {
        console.warn(`  ⚠ Failed to create attribute '${attr.args[2]}':`, err.message);
      }
    }
  }

  // Wait for attributes to be available
  console.log('Waiting for attributes to be indexed...');
  await new Promise(r => setTimeout(r, 3000));

  // ── 4. Create Index ─────────────────────────────────────

  console.log('Creating indexes...');
  try {
    await databases.createIndex(
      APPWRITE_DATABASE_ID,
      APPWRITE_FILES_COLLECTION_ID,
      'idx_ownerId',
      'key',
      ['ownerId']
    );
    console.log('  ✓ Index on ownerId created');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ⓘ Index already exists');
    } else {
      console.warn('  ⚠ Index creation failed:', err.message);
    }
  }

  // ── 5. Create Storage Bucket ────────────────────────────

  console.log('Creating storage bucket...');
  try {
    await storage.createBucket(
      APPWRITE_BUCKET_ID,
      'User Files',
      [
        // No bucket-level permissions — we use file-level permissions
      ],
      true, // fileSecurity enabled — allows per-file permissions
      undefined, // enabled
      10 * 1024 * 1024, // 10MB max file size
      ['image/jpeg', 'image/png', 'application/pdf', 'text/plain',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    );
    console.log('  ✓ Storage bucket created');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ⓘ Storage bucket already exists');
    } else {
      throw err;
    }
  }

  console.log('\n✅ Appwrite setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Run: node appwrite/scripts/seed.js');
  console.log('  2. Update the Appwrite settings in index.html');
  console.log('  3. Select "Appwrite" mode and test');
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
