/**
 * auth.routes.js — Public auth endpoints.
 */
const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { loginRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = Router();

// POST /register — public
router.post('/register', authController.register);

// POST /login — public, rate-limited
router.post('/login', loginRateLimiter, authController.login);

// POST /logout — protected (must be authenticated to logout)
router.post('/logout', authenticate, authController.logout);

module.exports = router;
