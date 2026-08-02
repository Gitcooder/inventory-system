# Deployment Guide

This covers taking the app from `npm run dev` to a real environment. It assumes you have a Postgres instance, a Redis instance, and somewhere to run two containers (or two Node processes + a static file host).

## 1. Required environment variables

**API** (`apps/api/.env` in dev; real secrets in your platform's secret manager in production — never commit them):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Use a pooled connection string (e.g. PgBouncer, or your cloud provider's pooler) if you expect more than a handful of concurrent instances — Prisma opens a real connection pool per instance. |
| `REDIS_URL` | Needs to support Pub/Sub (`AlertsGateway`) — most managed Redis works fine; if you're on a proxy/cluster mode product, confirm Pub/Sub is supported before relying on it. |
| `JWT_ACCESS_SECRET` | Generate with `openssl rand -base64 48` or equivalent. Rotating it invalidates every live access token immediately (users just get a fresh one via their still-valid refresh token, so this is a safe "kick everyone's session" lever if you ever need it). |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Defaults (`15m` / `7d`) are reasonable; shorten `JWT_ACCESS_TTL` if you want compromised-token exposure windows tighter, at the cost of more refresh traffic. |
| `WEB_ORIGIN` | Must be the exact origin the frontend is served from — this drives both CORS and the refresh-cookie's implicit same-site behavior. |
| `PORT` | Defaults to 3000. |
| `NODE_ENV=production` | **Required** in production — this is what flips the refresh cookie to `secure: true` (HTTPS-only) and switches structured logging from pretty-printed to JSON. Without it, the refresh cookie will still work over HTTP, which you do not want in production. |

**Web** (build-time only — see §3, Vite bakes these into the static bundle, they are not runtime config):
- `VITE_API_URL` — e.g. `https://api.example.com/api`
- `VITE_WS_URL` — e.g. `https://api.example.com`

## 2. Database migrations

Locally you use `prisma migrate dev`, which is interactive and can reset your database. **Never run `migrate dev` against production.** Use:

```bash
npx prisma migrate deploy
```

This applies pending migrations non-interactively and never resets data. Run it as a one-off step before the new API version starts serving traffic (a CI/CD "migrate" step before "deploy", or a Kubernetes init container, or just SSH in and run it — whatever fits your platform). The CI workflow (`.github/workflows/ci.yml`) already runs this against a throwaway database on every push as a correctness check; it does not touch any real database.

Seed data (`npm run seed`) creates the permission/role rows the app assumes exist (see `prisma/seed.ts`) plus one bootstrap Admin user. Run it once against a fresh production database; running it again is safe (it upserts permissions/roles) except it will error on the Admin user's email already existing — that's fine, ignore it, or delete that line from the script once you have real admin accounts.

## 3. Building and running with Docker

Both `apps/api/Dockerfile` and `apps/web/Dockerfile` **must be built from the repo root**, not their own directory — this is an npm workspaces monorepo, and `npm ci` needs the root lockfile to resolve correctly. Each Dockerfile has this called out at the top.

```bash
# From the repo root:
docker build -f apps/api/Dockerfile -t inventory-api .

docker build -f apps/web/Dockerfile -t inventory-web \
  --build-arg VITE_API_URL=https://api.example.com/api \
  --build-arg VITE_WS_URL=https://api.example.com .
```

The web image bakes the API URL in at build time (standard for a static Vite SPA) — if you point it at a different API, you rebuild the image, you don't change a runtime env var.

`docker-compose.yml` has both services defined (commented out by default, since day-to-day dev runs on the host — see the comment there) with the correct root build context already wired up. Uncomment them to run the whole stack, including Postgres/Redis, in one `docker compose up`.

Both images run as a non-root user and expose a `HEALTHCHECK` hitting `/api/health` (api) or the Nginx root (web) — your orchestrator can use these directly, or see §5 for the more detailed readiness check the API also exposes.

## 4. Reverse proxy / TLS

Neither container terminates TLS itself. Put a reverse proxy in front (Nginx, Caddy, your cloud load balancer, Cloudflare, etc.) that:
- Terminates HTTPS and forwards plain HTTP to the containers internally
- Forwards the `Upgrade`/`Connection` headers for the WebSocket path so the Phase 5 real-time alerts actually upgrade instead of falling back to polling — most proxies handle this by default for Nginx (`proxy_set_header Upgrade $http_upgrade`) but it's easy to miss on a generic HTTP-only config
- Sets `X-Forwarded-For`/`X-Forwarded-Proto` so `req.ip` (used in audit logging, see `AuditLogService`) reflects the real client IP, not the proxy's

## 5. Health checks

Two separate endpoints, deliberately not one — see the comments in `app.service.ts`:
- `GET /api/health` — **liveness**. "Is the process up." No dependency checks. Use this for your orchestrator's restart decision; a slow database should never cause a healthy process to be killed and restarted in a loop.
- `GET /api/health/ready` — **readiness**. Checks Postgres (`SELECT 1`) and Redis (`PING`), returns `200` with `{"status":"ok"}` if both are reachable or `503` with a per-dependency breakdown if not. Use this for load-balancer routing decisions ("should traffic go to this instance right now"), not for restarts.

## 6. Logging

Structured JSON logging via `nestjs-pino` (`src/common/logger.config.ts`) — every HTTP request/response is one JSON line with a request id, ready to ship to whatever log aggregator you use (CloudWatch Logs, Datadog, Loki, etc. — all of them expect JSON-per-line and will parse this natively). Sensitive fields (`Authorization` header, the refresh-token cookie, request-body `password`/`newPassword`) are redacted before they're ever serialized — check `logger.config.ts` if you add new endpoints that accept other sensitive fields and extend the `redact.paths` list accordingly.

In non-production (`NODE_ENV` unset or not `production`), logs are pretty-printed for local readability instead.

Unhandled errors (anything that reaches `AllExceptionsFilter` as a non-`HttpException`, or an `HttpException` with a 5xx status) are logged at `error` level with the full exception. Expected 4xx rejections (validation failures, 404s, permission denials) are logged at `debug` level — they're normal traffic, not incidents, and logging every one at error level would drown out what actually needs attention.

There's no APM/error-tracking integration (Sentry, etc.) wired up — the structured logs are the whole observability story right now. Adding one is a reasonable next step once you have real traffic to monitor.

## 7. Backups

**Postgres** is the system of record — everything else (Redis) is cache/ephemeral and can be reconstructed. Back up Postgres with your provider's native tooling if you're on a managed database (RDS automated snapshots, Cloud SQL backups, etc. — strongly preferred, since they handle point-in-time recovery correctly). If self-managing:

```bash
# Backup
pg_dump --format=custom --file=backup.dump "$DATABASE_URL"

# Restore (to an empty database)
pg_restore --dbname="$DATABASE_URL" --clean --if-exists backup.dump
```

Run this on a schedule (cron, a scheduled CI job, whatever fits) and — this is the part people skip — **actually test a restore** at least once before you need it for real. A backup you've never restored is a hypothesis, not a backup.

**Redis** holds the permission cache, the products cache-aside layer, and Pub/Sub channels — nothing in Redis is authoritative. If Redis is lost entirely, the app keeps working (every cache read falls back to Postgres on a miss, see `ProductsService`'s and `RbacService`'s cache helpers) with a brief performance dip and a moment of missed real-time alerts, not data loss. No backup strategy needed for Redis in this architecture.

## 8. Scaling

The API is stateless by design — no in-memory session state, no sticky-session requirement. Horizontal scaling (more instances behind a load balancer) works out of the box for everything except one detail: **`AlertsGateway`'s WebSocket connections are per-instance**, and the Redis Pub/Sub fan-out (see docs/architecture.md §6.2 and the Phase 5 README section) is specifically what makes multi-instance alerting correct — every instance subscribes to the same Redis channel independently, so a stock change on instance A still reaches a browser connected to instance B. This already works with zero additional configuration; it's *why* the Pub/Sub layer exists rather than a simpler in-process event emitter.

If you scale to enough instances that Postgres connection count becomes a concern, put a connection pooler (PgBouncer, or your cloud provider's built-in one) between the app and Postgres — Prisma's own pool is per-instance, so N instances × Prisma's default pool size can exhaust Postgres's `max_connections` faster than expected.
