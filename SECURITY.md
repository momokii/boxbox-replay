# Security policy

## Reporting

Please report suspected vulnerabilities privately through GitHub’s **Security →
Report a vulnerability** flow for this repository. Do not open a public issue
containing a key, exploit, or personal data. The project is a non-commercial
portfolio app and has no bug bounty.

## Scope and model

- The app is **read-only over public historical F1 data**. There are no user
  accounts, uploads, payments, or user-generated content.
- The FastAPI service is not published directly in production; nginx proxies
  `/api` from the same origin. There is no CORS grant.
- All data source identifiers (year, round, session key, driver number) are
  validated and clamped before use. No user-supplied URL is fetched (no SSRF
  surface).
- OpenF1 and Jolpica keys (if configured) stay server-side in `.env` (mode 600,
  gitignored). The browser never receives a key. AI answers are generated only
  server-side and are bounded by a rate limit and token cap.
- The optional AI endpoint can consume provider quota. Treat a public deployment
  as cost-bearing and keep the shared `AI_RATE_PER_MIN` (1/s, 6/min), the
  per-client 3/min + 20/hour windows and `AI_MAX_TOKENS` bounded. Chat bodies
  are schema-capped and nginx rejects request bodies over 256 KB.
- Browser security headers are set by `web/nginx.conf`: a same-origin CSP,
  `nosniff`, `DENY` framing, strict referrer policy and a restrictive
  permissions policy. External images are limited to F1’s media host; team-radio
  audio may use HTTPS.
- Dependencies are pinned; CI runs ruff/pytest, npm test/build, gitleaks over the
  full history, pip-audit, and a production-only npm audit. The advisory scan is
  documented in `.github/workflows/ci.yml`.

## Data and attribution

OpenF1 historical data is used under its free, non-commercial terms; Jolpica
results/standings are CC BY-NC-SA 4.0 with attribution in the UI and docs. Driver
headshots are linked from OpenF1’s `headshot_url` and remain hosted by Formula 1;
they are not rehosted.

## Supported version

Security fixes target the current `main` and the latest `v4.7.x` tag.
