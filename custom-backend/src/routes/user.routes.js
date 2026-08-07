/**
 * user.routes.js — Current-user profile endpoint.
 */
const { Router } = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// GET /me — protected
router.get('/me', authenticate, userController.getMe);

module.exports = router;
