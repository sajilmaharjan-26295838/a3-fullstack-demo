# Security Audit – Project Portal (a3-fullstack-demo)

**Date:** 2 November 2026
**Scope:** Express API (`server/`) and React client (`client/`)
**Criteria:** Authentication, authorisation (RBAC), and encryption and data protection, as listed in the target job advertisements, checked against the OWASP Top 10 (2021).
**Methods:** `npm audit`, automated tests (`node:test` + supertest), live HTTP probing of a running instance, manual code review, and a grep scan for hard-coded secrets.

## Summary

| # | Finding | OWASP category | Severity | Status |
|---|---------|----------------|----------|--------|
| F1 | Oversized or malformed request bodies returned **500** and logged a full stack trace | A05 Security Misconfiguration / A09 Logging | Medium | **Fixed** (regression tests added) |
| F2 | 12 moderate npm advisories in the ESLint dev toolchain (`minimatch` ReDoS, GHSA-g3hv-75wg-m249) | A06 Vulnerable & Outdated Components | Low (dev-only) | **Accepted risk**, mitigated by CI gate + Dependabot |
| F3 | Stateless JWTs cannot be revoked before they expire | A07 Identification & Authentication Failures | Low | Mitigated (15-minute expiry); refresh/revocation planned |
| F4 | The rate limiter uses an in-memory store, so each instance keeps its own count | A07 | Low | Accepted for single instance; needs a shared store (e.g. Redis) to scale |
| F5 | Users are held in memory; there is no persistent database | — | Info | Out of scope for demo |
| F6 | API deploys use a long-lived publish-profile credential (Basic auth) instead of short-lived OIDC tokens | A07 / A05 | Low | **Accepted risk**; move to OIDC planned |

## Findings in detail

### F1 – Client errors reported as server errors (Fixed)
- **How found:** live probe. A 20 KB JSON login body returned `500 Internal Server Error`, and the server logged a full `PayloadTooLargeError` stack trace that included internal file paths.
- **Risk:** misleading status codes, and logs that an attacker can flood with large requests. Stack traces expose internal structure if logs are ever surfaced.
- **Fix:** the global error handler now keeps 4xx statuses from middleware (413 for too large, 400 for malformed JSON) and only logs genuine 5xx errors.
- **Verification:** new tests `oversized request bodies are rejected with 413` and `malformed JSON is rejected with 400`.

### F2 – Vulnerable dev dependency (Accepted risk)
- **How found:** `npm audit` in `client/` reported 12 moderate issues, all from one advisory in `minimatch` < 11.0.1 that comes in through `eslint` and `typescript-eslint`.
- **Production impact:** `npm audit --omit=dev` shows **0 vulnerabilities**. The affected code runs only when linting on a developer machine or CI, and is never shipped in `dist/`.
- **Attempted fix:** upgrading to ESLint 10 failed with a peer-dependency conflict (`eslint-plugin-react-hooks`). `npm audit fix --force` would downgrade `typescript-eslint` (a breaking change).
- **Decision:** accept for now. CI fails the build on any **high/critical** vulnerability in production dependencies, and Dependabot raises weekly update PRs, so this will be fixed when the plugin ecosystem supports the new version.

### F3 / F4 – Token revocation and rate-limit storage
These are design limitations accepted for a single-instance demo and are documented for future work.

### F6 – Deployment credential (Accepted risk)
- **Context:** Azure Deployment Center's password-free option (user-assigned identity with GitHub OIDC) failed with *"We couldn't verify how GitHub Actions issues OIDC tokens for this repository"*. The repository was created after 15 July 2026, so GitHub issues **immutable subject claims** (`repo:<owner>@<id>/<repo>@<id>`). Azure's automatic setup doesn't yet recognise that format, and the setting can't be turned off for this repo.
- **Decision:** use Basic authentication. Azure stores a publish profile as the encrypted GitHub secret `AZUREAPPSERVICE_PUBLISHPROFILE_…`, which is referenced only by the deploy job.
- **Mitigations:** the workflow runs with `permissions: contents: read`; it deploys only from `main`; the secret is never printed; the profile can be reset from the App Service's **Overview → Reset publish profile**.
- **Planned fix:** configure the federated credential by hand on the managed identity, using the immutable subject (`repo:sajilmaharjan-26295838@266583327/a3-fullstack-demo@1442653804:ref:refs/heads/main`). Then switch the workflow to `azure/login` with OIDC and turn SCM Basic Auth off.

## Controls verified (passed)

| Control | Evidence |
|---------|----------|
| Passwords stored as bcrypt hashes and never returned by the API | Code review; test `password hashes are never returned` |
| Same error for unknown user and wrong password (no user enumeration) | Test `does not reveal which part was wrong` |
| Brute-force protection on login | Live probe: 12 bad logins → `401` ×10, then `429` ×2 |
| JWT signature verified and algorithm pinned to HS256 | Tests: forged signature → 401; `alg=none` token → 401 |
| Weak JWT secret refused at startup (minimum 32 characters) | Test `refuses to start with a weak JWT secret` |
| RBAC enforced on the server, not just hidden in the UI | Tests: viewer → 403 on write; editor → 403 on `/api/users` |
| Input validation on project names | Test `rejects empty project names` |
| Security headers (CSP, X-Content-Type-Options, etc.), `X-Powered-By` removed | Test + live probe |
| CORS restricted to the client origin | Live probe: `Access-Control-Allow-Origin: http://localhost:5173` |
| Request body limited to 10 KB | Live probe (now returns 413) |
| No hard-coded production secrets | grep scan: only a test-only secret in `server/test/auth.test.js` |
| Token held in memory on the client, not `localStorage` | Code review (`client/src/App.tsx`) |
| Encryption in transit | **Depends on deployment.** HTTPS is provided by the hosting platform (Azure); see `DEPLOY.md` |

## Ongoing controls (in CI)
- `.github/workflows/ci.yml`: tests, lint, build, and an `npm audit` gate on every push/PR
- `.github/workflows/codeql.yml`: GitHub CodeQL static analysis, weekly and on every PR
- `.github/dependabot.yml`: weekly dependency and Actions updates
