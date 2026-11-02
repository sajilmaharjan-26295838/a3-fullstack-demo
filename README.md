# Project Portal – Full-stack Auth & RBAC Demo

A small full-stack app built as part of my 43030 Professional Learning Plan, covering CI/CD (Goal 3), cloud deployment (Goal 4) and application security (Goals 2 and 5).

**Stack:** React 19 + TypeScript + Vite · Node.js + Express · JWT authentication · role-based access control · GitHub Actions · CodeQL · Dependabot

## Features
- Login with bcrypt-hashed passwords and short-lived (15-minute) JWTs
- Three roles (admin / editor / viewer) mapped to permissions, enforced on the **server** (the UI only hides buttons)
- Hardening: helmet security headers, login rate limiting, request size limits, input validation, CORS restricted to the client
- 12 automated API security tests
- CI pipeline: test → lint → build → dependency audit gate, plus CodeQL scanning
- [Security audit report](SECURITY_AUDIT.md) with findings and fixes

## Run locally
```bash
# API
cd server
npm install
# PowerShell: $env:JWT_SECRET="<48+ random chars>"; $env:DEMO_PASSWORD="<pick one>"
JWT_SECRET=<48+ random chars> DEMO_PASSWORD=<pick one> npm run dev

# Client (new terminal)
cd client
npm install
npm run dev   # http://localhost:5173 (proxies /api to :3001)
```
Log in as `alice` (admin), `bob` (editor) or `carol` (viewer) with the `DEMO_PASSWORD` you set.

## Tests
```bash
cd server && npm test
```
