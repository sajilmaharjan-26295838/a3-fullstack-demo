import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const PASSWORD = process.env.DEMO_PASSWORD || 'change-me-locally';
const app = createApp({ jwtSecret: SECRET });

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  assert.equal(res.status, 200);
  return res.body.token;
}

test('refuses to start with a weak JWT secret', () => {
  assert.throws(() => createApp({ jwtSecret: 'short' }));
});

test('login fails with wrong password and does not reveal which part was wrong', async () => {
  const bad = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'nope' });
  const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'nope' });
  assert.equal(bad.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(bad.body, unknown.body);
});

test('protected routes require a token', async () => {
  const res = await request(app).get('/api/projects');
  assert.equal(res.status, 401);
});

test('tampered or wrongly signed tokens are rejected', async () => {
  const forged = jwt.sign({ sub: 3, username: 'carol', role: 'admin' }, 'some-other-secret-value-of-32-chars!!');
  const res = await request(app).get('/api/users').set('Authorization', `Bearer ${forged}`);
  assert.equal(res.status, 401);
});

test('viewer can read but not write projects', async () => {
  const token = await login('carol');
  const read = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
  const write = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'x' });
  assert.equal(read.status, 200);
  assert.equal(write.status, 403);
});

test('editor can write projects but cannot list users', async () => {
  const token = await login('bob');
  const write = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'New project' });
  const users = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
  assert.equal(write.status, 201);
  assert.equal(users.status, 403);
});

test('admin can list users and password hashes are never returned', async () => {
  const token = await login('alice');
  const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.every((u) => !('passwordHash' in u)));
});

test('input validation rejects empty project names', async () => {
  const token = await login('alice');
  const res = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: '   ' });
  assert.equal(res.status, 400);
});

test('security headers are set by helmet', async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.headers['x-content-type-options']);
  assert.ok(res.headers['content-security-policy']);
});

test('oversized request bodies are rejected with 413, not 500', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'a'.repeat(20000), password: 'x' });
  assert.equal(res.status, 413);
});

test('malformed JSON is rejected with 400, not 500', async () => {
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
  assert.equal(res.status, 400);
});

test('unsigned (alg=none) tokens are rejected', async () => {
  const res = await request(app).get('/api/users').set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.');
  assert.equal(res.status, 401);
});
