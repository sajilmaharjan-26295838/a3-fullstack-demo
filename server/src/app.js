import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Demo users. Passwords are stored only as bcrypt hashes, never plain text.
// The demo passwords come from env vars so nothing secret is committed.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'change-me-locally';
const users = [
  { id: 1, username: 'alice', role: 'admin', passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
  { id: 2, username: 'bob', role: 'editor', passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
  { id: 3, username: 'carol', role: 'viewer', passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
];

// Role -> permissions (RBAC). Routes check permissions, not role names.
export const ROLE_PERMISSIONS = {
  admin: ['projects:read', 'projects:write', 'users:read'],
  editor: ['projects:read', 'projects:write'],
  viewer: ['projects:read'],
};

const projects = [
  { id: 1, name: 'Green Star rating calculator', owner: 'alice' },
  { id: 2, name: 'Energy usage dashboard', owner: 'bob' },
];

export function createApp({ jwtSecret = process.env.JWT_SECRET } = {}) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '10kb' }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

  // Authentication: who are you?
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const user = users.find((u) => u.username === username);
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' }); // same message: no user enumeration
    const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    res.json({ token, role: user.role });
  });

  function authenticate(req, res, next) {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing token' });
    try {
      req.user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Authorisation: what are you allowed to do?
  const requirePermission = (permission) => (req, res, next) => {
    const perms = ROLE_PERMISSIONS[req.user?.role] || [];
    if (!perms.includes(permission)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/me', authenticate, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role, permissions: ROLE_PERMISSIONS[req.user.role] });
  });

  app.get('/api/projects', authenticate, requirePermission('projects:read'), (_req, res) => res.json(projects));

  app.post('/api/projects', authenticate, requirePermission('projects:write'), (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100) return res.status(400).json({ error: 'name must be 1-100 characters' });
    const project = { id: projects.length + 1, name, owner: req.user.username };
    projects.push(project);
    res.status(201).json(project);
  });

  app.get('/api/users', authenticate, requirePermission('users:read'), (_req, res) => {
    res.json(users.map(({ id, username, role }) => ({ id, username, role }))); // never return hashes
  });

  // Generic error handler: don't leak stack traces.
  // Client errors raised by middleware (e.g. body too large, malformed JSON) keep their 4xx
  // status instead of being reported as a 500 with a full stack trace (found in security audit).
  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.expose ? err.message : 'Bad request' });
  });

  return app;
}
