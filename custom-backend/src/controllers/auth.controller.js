/**
 * auth.controller.js — Handles register, login, logout requests.
 *
 * Login sets an HttpOnly cookie with the session ID AND returns it
 * in the response body (so the testing client's token field is populated).
 *
 * Cookie settings:
 *   - HttpOnly: true (JS cannot read the cookie → XSS protection)
 *   - SameSite: 'Lax' (CSRF mitigation, allows top-level navigation)
 *   - Secure: true in production (cookie only sent over HTTPS)
 *   - maxAge: 24 hours (matches server-side session expiry)
 *
 * Logout revokes the server-side session AND clears the cookie.
 */
const authService = require('../services/auth.service');
const { isValidEmail, passwordPolicyErrors } = require('../utils/validators');
const env    = require('../config/env');
const logger = require('../utils/logger');

/**
 * Build cookie options based on environment.
 */
function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:   env.isProd(),       // only over HTTPS in production
    maxAge:   maxAgeMs,
    path:     '/',
  };
}

/**
 * POST /register
 * Body: { email, password, name? }
 */
async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    // Validate email
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    // Validate password
    const policyErrors = passwordPolicyErrors(password);
    if (policyErrors.length > 0) {
      return res.status(400).json({ error: policyErrors.join('. ') });
    }

    // Check duplicate
    const exists = await authService.emailExists(email);
    if (exists) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    // Create user
    const user = await authService.registerUser({
      email,
      password,
      fullName: name || '',
      displayName: name || email.split('@')[0],
    });

    return res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /login
 * Body: { email, password }
 *
 * SECURITY: Always returns a generic error message for invalid credentials.
 * Never reveals whether the email exists or whether the password is wrong.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const GENERIC_ERROR = 'Invalid email or password';
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check account lockout
    const lockout = await authService.checkAccountLockout(email);
    if (lockout.locked) {
      logger.info('Login blocked (lockout) for %s from IP %s', email, ipAddress);
      return res.status(429).json({
        error: 'Too many failed attempts. Try again later.',
      });
    }

    // Verify credentials
    const user = await authService.verifyCredentials(email, password);

    if (!user) {
      await authService.recordLoginAttempt(email, ipAddress, false);
      logger.info('Failed login attempt for %s from IP %s', email, ipAddress);
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Success — record attempt and create session
    await authService.recordLoginAttempt(email, ipAddress, true);
    const { sessionId, expiresAt } = await authService.createSession(user.id);

    // Set HttpOnly cookie
    res.cookie(env.COOKIE_NAME, sessionId, cookieOptions(env.SESSION_EXPIRY_MS));

    logger.info('Successful login for %s from IP %s', email, ipAddress);

    // Also return token in body so the testing client can display it
    return res.status(200).json({
      token: sessionId,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /logout
 *
 * Revokes the server-side session AND clears the cookie.
 * After this, the old session ID will fail on any protected route.
 */
async function logout(req, res, next) {
  try {
    if (req.sessionId) {
      await authService.revokeSessionById(req.sessionId);
      logger.info('Logout: session revoked for user %s', req.user?.email);
    }

    // Clear the cookie
    res.clearCookie(env.COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   env.isProd(),
      path:     '/',
    });

    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout };
