/**
 * file.controller.js — File endpoints with strict ownership enforcement.
 *
 * GET /files       — list authenticated user's files only
 * GET /files/:id   — single file metadata (ownership verified)
 * GET /files/:id/download — stream file content (ownership verified)
 */
const path = require('path');
const fs   = require('fs');
const fileService = require('../services/file.service');
const logger = require('../utils/logger');

/**
 * GET /files
 * Returns ONLY files belonging to the authenticated user.
 */
async function listFiles(req, res, next) {
  try {
    const files = await fileService.getFilesByUserId(req.user.id);

    // Format to match the mock API's response shape
    const formatted = files.map(f => ({
      id:         f.id,
      ownerId:    f.user_id,
      fileName:   f.original_filename,
      mimeType:   f.mime_type,
      sizeBytes:  parseInt(f.size, 10),
      uploadedAt: f.created_at,
    }));

    return res.status(200).json({ files: formatted });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /files/:id
 * Returns file metadata ONLY if the authenticated user owns it.
 * Returns 403 if the file exists but belongs to another user.
 * Returns 404 if the file doesn't exist at all.
 */
async function getFile(req, res, next) {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;

    // First try to get the file with ownership check
    const file = await fileService.getFileByIdAndUser(fileId, userId);

    if (file) {
      return res.status(200).json({
        file: {
          id:         file.id,
          ownerId:    file.user_id,
          fileName:   file.original_filename,
          mimeType:   file.mime_type,
          sizeBytes:  parseInt(file.size, 10),
          uploadedAt: file.created_at,
        },
      });
    }

    // File not found for this user — check if it exists at all
    const exists = await fileService.fileExists(fileId);
    if (exists) {
      // File exists but belongs to another user → IDOR attempt
      logger.warn('IDOR attempt: user %s tried to access file %s', userId, fileId);
      return res.status(403).json({ error: 'You do not have access to this file' });
    }

    return res.status(404).json({ error: 'File not found' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /files/:id/download
 * Streams the actual file content (ownership verified).
 */
async function downloadFile(req, res, next) {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;

    const file = await fileService.getFileByIdAndUser(fileId, userId);

    if (!file) {
      const exists = await fileService.fileExists(fileId);
      if (exists) {
        logger.warn('IDOR download attempt: user %s tried to download file %s', userId, fileId);
        return res.status(403).send('Forbidden');
      }
      return res.status(404).send('File not found');
    }

    // Resolve the storage path safely
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    const filePath   = path.resolve(uploadsDir, file.filename);

    // Path traversal protection: ensure resolved path is within uploads dir
    if (!filePath.startsWith(uploadsDir)) {
      logger.warn('Path traversal attempt for file %s', fileId);
      return res.status(400).send('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      // File record exists in DB but actual file is missing on disk
      return res.status(404).send('File not found on disk');
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { listFiles, getFile, downloadFile };
