/**
 * app.js — Express application entry point.
 *
 * Sets up:
 *   - Security headers (Helmet)
 *   - CORS with credentials support
 *   - Cookie parsing (for HttpOnly session cookies)
 *   - Request body parsing with size limits
 *   - Global rate limiting
 *   - Routes
 *   - Centralized error handling
 *   - Graceful shutdown
 */
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const env          = require('./config/env');
const logger       = require('./utils/logger');
const { globalRateLimiter } = require('./middleware/rateLimiter.middleware');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const fileRoutes = require('./routes/file.routes');

const app = express();

// ── Security Headers ──────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────
// credentials: true is required for cross-origin cookie sending
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.NODE_ENV !== 'production' || env.CORS_ORIGIN.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Cookie Parser ─────────────────────────────────────────
app.use(cookieParser());

// ── Body Parsing ──────────────────────────────────────────
// Limit request size to prevent abuse
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Trust Proxy (for rate-limiter behind reverse proxy) ───
app.set('trust proxy', 1);

// ── Global Rate Limiter ───────────────────────────────────
app.use(globalRateLimiter);

// ── Health Check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────
app.use(authRoutes);   // POST /register, /login, /logout
app.use(userRoutes);   // GET /me
app.use(fileRoutes);   // GET /files, /files/:id, /files/:id/download

// ── 404 Handler ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error Handler ─────────────────────────────────────────
app.use(errorHandler);

// ── Start Server (only if not imported by tests) ──────────
if (require.main === module) {
  const server = app.listen(env.PORT, () => {
    logger.info('Server listening on port %d (%s)', env.PORT, env.NODE_ENV);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info('Received %s — shutting down gracefully', signal);
    server.close(() => {
      const { pool } = require('./config/db');
      pool.end().then(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = app;
