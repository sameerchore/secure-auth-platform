/**
 * file.routes.js — File endpoints (all protected).
 */
const { Router } = require('express');
const fileController = require('../controllers/file.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// GET /files — list authenticated user's files
router.get('/files', authenticate, fileController.listFiles);

// GET /files/:id — single file metadata (ownership checked)
router.get('/files/:id', authenticate, fileController.getFile);

// GET /files/:id/download — stream file content (ownership checked)
router.get('/files/:id/download', authenticate, fileController.downloadFile);

module.exports = router;
