/**
 * appwrite-adapter.js
 * ===================
 * Adapter that plugs into index.html to use Appwrite as the backend.
 *
 * When "Appwrite" mode is selected in the testing client, this script
 * intercepts window.fetch calls and routes them through the Appwrite
 * Web SDK instead of hitting the custom REST backend.
 *
 * Appwrite handles:
 *   - Password hashing (automatic, server-side)
 *   - Session management (cookie-based, server-side)
 *   - Account creation and authentication APIs
 *   - Database document-level permissions
 *   - Storage file-level permissions
 *
 * We configure:
 *   - Collection attributes and indexes
 *   - Document-level read/write permissions per user
 *   - File-level read/write permissions per user
 *   - The adapter logic that maps our API contract to Appwrite SDK calls
 */

(function () {
  'use strict';

  // ── Configuration (read from the UI fields) ─────────────

  function getConfig() {
    return {
      endpoint:         document.getElementById('awEndpoint').value.trim(),
      projectId:        document.getElementById('awProjectId').value.trim(),
      databaseId:       document.getElementById('awDatabaseId').value.trim(),
      filesCollectionId: document.getElementById('awFilesCollectionId').value.trim(),
      bucketId:         document.getElementById('awBucketId').value.trim(),
    };
  }

  // ── Appwrite Client (lazy-initialized) ──────────────────

  let client   = null;
  let account  = null;
  let databases = null;
  let storage  = null;

  function ensureClient() {
    const cfg = getConfig();
    if (!client || client._endpoint !== cfg.endpoint || client._projectId !== cfg.projectId) {
      // The Appwrite Web SDK is loaded via a <script> tag in index.html
      const { Client, Account, Databases, Storage } = window.Appwrite || window;

      client = new Client();
      client.setEndpoint(cfg.endpoint).setProject(cfg.projectId);
      client._endpoint  = cfg.endpoint;
      client._projectId = cfg.projectId;

      account   = new Account(client);
      databases = new Databases(client);
      storage   = new Storage(client);
    }
    return { account, databases, storage };
  }

  // ── JSON Response Helper ────────────────────────────────

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Route Handlers ──────────────────────────────────────

  /**
   * POST /register
   * Uses Appwrite Account.create()
   * Appwrite automatically hashes the password server-side.
   */
  async function handleRegister(req) {
    try {
      const { email, password, name } = await req.json();
      const { account } = ensureClient();

      // Appwrite requires a unique userId; we use 'unique()' for auto-generation
      const user = await account.create('unique()', email, password, name || email.split('@')[0]);

      return json(201, { id: user.$id, email: user.email });
    } catch (err) {
      console.error('[appwrite-adapter] Register error:', err);
      if (err.code === 409) {
        return json(409, { error: 'An account with that email already exists' });
      }
      return json(400, { error: err.message || 'Registration failed' });
    }
  }

  /**
   * POST /login
   * Uses Appwrite Account.createEmailPasswordSession()
   * Appwrite manages sessions with secure cookies.
   */
  async function handleLogin(req) {
    try {
      const { email, password } = await req.json();
      const { account } = ensureClient();

      const session = await account.createEmailPasswordSession(email, password);
      const user    = await account.get();

      return json(200, {
        token: session.$id, // Appwrite session ID (actual auth is cookie-based)
        user: { id: user.$id, email: user.email },
      });
    } catch (err) {
      console.error('[appwrite-adapter] Login error:', err);
      // Return the actual error message for debugging purposes
      return json(401, { error: err.message || 'Invalid email or password' });
    }
  }

  /**
   * POST /logout
   * Uses Appwrite Account.deleteSession('current')
   * This deletes the server-side session; Appwrite clears the cookie.
   */
  async function handleLogout() {
    try {
      const { account } = ensureClient();
      await account.deleteSession('current');
      return json(200, { message: 'Logged out' });
    } catch (err) {
      console.error('[appwrite-adapter] Logout error:', err);
      return json(200, { message: 'Logged out' }); // graceful even if no session
    }
  }

  /**
   * GET /me
   * Uses Appwrite Account.get()
   * Returns ONLY the currently authenticated user's profile.
   */
  async function handleMe() {
    try {
      const { account } = ensureClient();
      const user = await account.get();

      return json(200, {
        id:    user.$id,
        email: user.email,
        profile: {
          fullName:    user.name || '',
          displayName: user.name || user.email.split('@')[0],
          bio:         '',
          createdAt:   user.$createdAt,
          role:        'user',
        },
      });
    } catch (err) {
      return json(401, { error: 'Not authenticated' });
    }
  }

  /**
   * GET /files
   * Lists documents from the files collection where the user has read permission.
   * Appwrite's document-level permissions ensure only the owner's files are returned.
   */
  async function handleFiles() {
    try {
      const { account, databases } = ensureClient();
      const cfg  = getConfig();

      // Verify authentication
      await account.get();

      const response = await databases.listDocuments(cfg.databaseId, cfg.filesCollectionId);

      const files = response.documents.map(doc => ({
        id:         doc.$id,
        ownerId:    doc.ownerId,
        fileName:   doc.fileName,
        mimeType:   doc.mimeType,
        sizeBytes:  doc.sizeBytes,
        uploadedAt: doc.$createdAt,
      }));

      return json(200, { files });
    } catch (err) {
      if (err.code === 401) return json(401, { error: 'Not authenticated' });
      return json(500, { error: 'Failed to list files' });
    }
  }

  /**
   * GET /files/:id
   * Gets a single document. Appwrite enforces read permissions —
   * if the user doesn't have access, Appwrite returns 404.
   */
  async function handleFileById(fileId) {
    try {
      const { account, databases } = ensureClient();
      const cfg = getConfig();

      await account.get();

      const doc = await databases.getDocument(cfg.databaseId, cfg.filesCollectionId, fileId);

      return json(200, {
        file: {
          id:         doc.$id,
          ownerId:    doc.ownerId,
          fileName:   doc.fileName,
          mimeType:   doc.mimeType,
          sizeBytes:  doc.sizeBytes,
          uploadedAt: doc.$createdAt,
        },
      });
    } catch (err) {
      if (err.code === 401) return json(401, { error: 'Not authenticated' });
      if (err.code === 404) return json(404, { error: 'File not found' });
      return json(403, { error: 'You do not have access to this file' });
    }
  }

  /**
   * GET /files/:id/download
   * Downloads the actual file from Appwrite Storage.
   * File-level permissions ensure only the owner can download.
   */
  async function handleFileDownload(fileId) {
    try {
      const { account, databases, storage } = ensureClient();
      const cfg = getConfig();

      await account.get();

      // Get the document to find the storageFileId
      const doc = await databases.getDocument(cfg.databaseId, cfg.filesCollectionId, fileId);

      if (!doc.storageFileId) {
        return new Response('File not found on storage', { status: 404 });
      }

      // Get the file download URL from Appwrite Storage
      const result = storage.getFileDownload(cfg.bucketId, doc.storageFileId);

      // Redirect to Appwrite's download URL
      const response = await fetch(result, { credentials: 'include' });
      return response;
    } catch (err) {
      if (err.code === 401) return new Response('Not authenticated', { status: 401 });
      if (err.code === 404) return new Response('File not found', { status: 404 });
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ── Patch window.fetch ──────────────────────────────────

  const realFetch = window.fetch.bind(window);

  const originalPatchedFetch = window.fetch;

  window.fetch = async function (input, init) {
    // Only intercept in Appwrite mode
    const appwriteRadio = document.querySelector('input[name="backendMode"][value="appwrite"]');
    if (!appwriteRadio || !appwriteRadio.checked) {
      return originalPatchedFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input.url;
    let pathname;
    try {
      pathname = new URL(url, window.location.href).pathname;
    } catch {
      return realFetch(input, init);
    }

    const req = new Request(url, init);

    // Simulate slight delay
    await new Promise(r => setTimeout(r, 100));

    if (pathname === '/register' && req.method === 'POST') return handleRegister(req);
    if (pathname === '/login'    && req.method === 'POST') return handleLogin(req);
    if (pathname === '/logout'   && req.method === 'POST') return handleLogout();
    if (pathname === '/me'       && req.method === 'GET')  return handleMe();
    if (pathname === '/files'    && req.method === 'GET')  return handleFiles();

    let m = pathname.match(/^\/files\/([^/]+)\/download$/);
    if (m && req.method === 'GET') return handleFileDownload(m[1]);

    m = pathname.match(/^\/files\/([^/]+)$/);
    if (m && req.method === 'GET') return handleFileById(m[1]);

    // Not an API route — pass through to real fetch (for Appwrite SDK calls)
    return realFetch(input, init);
  };

  console.info('[appwrite-adapter] loaded — select "Appwrite" mode to activate');
})();
