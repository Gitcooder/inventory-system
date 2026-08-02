# Pharma-Grade Inventory & Dispensing System
## Architecture Blueprint + Phased Build Roadmap

**Stack decision (since you said "recommend one"):**

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js + NestJS + TypeScript** | Built-in modular architecture, Guards (perfect for RBAC), native WebSocket Gateways, dependency injection makes transactions/locking testable, huge ecosystem overlap with React (one language everywhere) |
| ORM | **Prisma** | Type-safe queries, first-class migrations, easy raw SQL escape hatch for `SELECT ... FOR UPDATE` |
| Database | **PostgreSQL** | Real `CHECK` constraints, row-level locking, deferrable constraints, JSON columns if needed later |
| Cache / Pub-Sub | **Redis** | Session cache, permission cache, Pub/Sub fan-out for alerts |
| Real-time | **Socket.io + Redis adapter** | WebSockets with automatic fallback, horizontal scaling built in |
| Frontend | **React + TypeScript + Vite** | You already chose this |
| Auth | **JWT (access + refresh) + bcrypt/argon2** | Stateless, scales horizontally |

We'll run this as **one React app with three route groups** (`/admin/*`, `/staff/*`, `/shop/*`) instead of three separate frontends — same UX separation the doc asks for, one codebase to maintain. If you ever need them deployed independently, splitting later is a small refactor since routes are already isolated.

---

## 1. System Topology

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Admin Panel │     │Employee Panel│    │Customer Panel│
│  (React)    │     │   (React)    │     │  (React)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │        HTTPS + WSS (single origin)     │
       └───────────────────┬─────────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │   NestJS API      │
                  │ (stateless nodes) │◄──── horizontally scaled
                  │  REST + WS Gateway│
                  └───┬───────────┬───┘
                      │           │
            ┌─────────▼───┐   ┌───▼─────────┐
            │ PostgreSQL  │   │    Redis    │
            │ (source of  │   │ sessions,   │
            │   truth)    │   │ perm cache, │
            │             │   │  pub/sub    │
            └─────────────┘   └─────────────┘
```

Key rule baked into the architecture: **the database is the final authority**, not the application. Constraints, locks, and foreign keys do the heavy lifting; app code just orchestrates.

---

## 2. Database Schema (PostgreSQL)

### 2.1 Identity & RBAC
```sql
users            (id, name, email UNIQUE, password_hash, phone, is_active, created_at, updated_at)
roles            (id, name UNIQUE, description)          -- Admin, Employee, Customer, Auditor...
permissions      (id, code UNIQUE, description)           -- 'stock:adjust', 'product:create', ...
user_roles       (user_id FK, role_id FK, PRIMARY KEY(user_id, role_id))
role_permissions (role_id FK, permission_id FK, PRIMARY KEY(role_id, permission_id))
refresh_tokens   (id, user_id FK, token_hash, expires_at, revoked_at)  -- rotation + logout-everywhere
```

### 2.2 Catalog
```sql
brands      (id, name)
categories  (id, name, description, parent_category_id FK NULL)   -- hierarchical
locations   (id, name, type, parent_location_id FK NULL, address) -- warehouse > aisle > shelf
products    (id, sku_code UNIQUE, name, brand_id FK, category_id FK,
             uses_description TEXT, unit_of_measure, is_active, created_at)
```

### 2.3 Stock & Movement
```sql
inventory_stocks (
  id, product_id FK, location_id FK,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  threshold_limit INTEGER NOT NULL DEFAULT 5,
  batch_number, expiration_date,
  updated_at,
  UNIQUE(product_id, location_id, batch_number)
)

usage_logs (                       -- INSERT-ONLY. Never UPDATE/DELETE. FK is ON DELETE RESTRICT.
  id BIGINT, product_id FK, user_id FK, location_id FK,
  quantity_used INTEGER NOT NULL CHECK (quantity_used > 0),
  purpose_description VARCHAR(255),
  timestamp TIMESTAMPTZ DEFAULT now()
)

stock_adjustments (                -- restocks, corrections, damage, expiry write-offs
  id, product_id FK, location_id FK, adjusted_by_user_id FK,
  adjustment_type VARCHAR CHECK (adjustment_type IN ('restock','correction','damage','expired')),
  quantity_change INTEGER,          -- signed
  reason TEXT, timestamp TIMESTAMPTZ DEFAULT now()
)
```

### 2.4 Customer Layer
```sql
product_reviews (
  id BIGINT, product_id FK, customer_id FK,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### 2.5 Alerting & Forensics (added beyond the doc — you'll want these)
```sql
alerts_log (      -- history of every threshold breach, so nothing is only "in the moment"
  id, product_id FK, location_id FK, stock_at_trigger, threshold_at_trigger,
  triggered_at, acknowledged_by FK NULL, acknowledged_at NULL
)

audit_log (       -- general admin/security trail — role changes, deletions, permission edits
  id BIGINT, user_id FK, action, entity_type, entity_id,
  old_value JSONB, new_value JSONB, ip_address, timestamp TIMESTAMPTZ DEFAULT now()
)
```
> `usage_logs` is huge over time (BIGINT id for a reason). Plan monthly range **partitioning** once you pass a few million rows — Postgres native partitioning, not an app concern.

---

## 3. Data Integrity Rules (DB-enforced, not just app-enforced)
- `CHECK (quantity >= 0)` on `inventory_stocks` — negative stock is structurally impossible.
- `FOREIGN KEY ... ON DELETE RESTRICT` from `usage_logs`/`stock_adjustments` to `products` — a product with history can never be hard-deleted (soft-delete via `is_active` instead).
- `UNIQUE` on `sku_code`, `users.email`, `(product_id, location_id, batch_number)`.
- Deferrable constraints reserved for later if a multi-table transfer workflow (e.g., moving stock between two locations as one atomic multi-row op) needs it.

## 4. Concurrency Control (the "zero negative stock" guarantee)
Primary mechanism: **pessimistic locking**, inside a DB transaction:
```sql
BEGIN;
SELECT quantity FROM inventory_stocks WHERE product_id = $1 AND location_id = $2 FOR UPDATE;
-- app checks quantity >= requested_amount
UPDATE inventory_stocks SET quantity = quantity - $3 WHERE product_id = $1 AND location_id = $2;
INSERT INTO usage_logs (...) VALUES (...);
COMMIT;
```
This is correct and simple to reason about at moderate-to-high throughput. If a specific product becomes a hot lock contention point at extreme scale, the fallback is a **Redis Lua script** doing the check-and-decrement atomically (single-threaded event loop = no race window), with the Postgres write happening asynchronously right after for the permanent ledger. We build with Postgres locking first; Redis-atomic is an optional Phase 8+ optimization, not a day-one requirement.

We will write an actual **concurrency test** (two simultaneous requests against 1 unit of stock) as part of the test suite — this is a claim we verify, not just assert.

## 5. RBAC Design

**Roles:** `Admin`, `Employee`, `Customer` (extensible — e.g., `Auditor` read-only later)

**Permission codes (examples):**
`product:create/update/delete/view`, `stock:adjust/view`, `dispense:create/view`, `category:manage`, `brand:manage`, `location:manage`, `user:manage`, `role:manage`, `review:create/moderate/view`, `report:view`, `audit:view`

Enforcement: NestJS **Guards** read the JWT, check role→permission map (cached in Redis, refreshed on role/permission changes), reject with `403` before the request touches business logic. Separation of duties is enforced at this layer — e.g., no role gets both `usage_logs` write access and `audit:view` deletion rights, since `usage_logs` never gets a delete permission at all.

## 6. Real-Time Low-Stock Alerts
1. Dispense transaction commits → new quantity ≤ `threshold_limit`.
2. API publishes a JSON payload to Redis channel `inventory:low_stock_alerts`.
3. Every NestJS instance is subscribed (Redis Pub/Sub → Socket.io Redis adapter handles the fan-out across horizontally scaled nodes automatically).
4. Connected Admin/Employee clients with the right permission receive the WebSocket push and render a toast/modal.
5. Every alert is also written to `alerts_log`, so nothing is lost if no one was online to see the popup — the Admin panel shows unacknowledged alerts on login too.

## 7. API Surface (REST + 1 WS namespace)
```
/api/auth            POST /login  POST /refresh  POST /logout
/api/users            CRUD (Admin only)
/api/roles /permissions   CRUD (Admin only)
/api/brands /categories /locations   CRUD
/api/products         CRUD, GET /products/:id/details  (aggregated page, see below)
/api/inventory        GET stock levels, POST /adjust (restock/correction)
/api/dispense         POST  (the locked transaction endpoint)
/api/reviews          POST (customer), PATCH /:id/moderate (admin), GET
/api/alerts           GET history, POST /:id/acknowledge
/api/reports          GET usage summaries, exports
/ws  (namespace: alerts)   -- Socket.io, JWT auth on handshake
```

**Product Details aggregation** (`GET /products/:id/details`) mirrors the doc's flow equation exactly: metadata JOIN → live stock → `COUNT/SUM` aggregate on `usage_logs` → paginated chronological ledger JOIN with `users`. One endpoint, four queries, single response — powers the "who took what, when, why" transparency requirement.

## 8. Security Checklist
- Passwords via **argon2** (or bcrypt), never reversible.
- JWT access token short-lived (~15 min) + rotating refresh token stored **httpOnly cookie** (not localStorage — avoids XSS token theft).
- Input validation on every DTO (`class-validator` in NestJS).
- Rate limiting (`@nestjs/throttler`) on auth and dispense endpoints specifically.
- `helmet` for HTTP headers, strict CORS allowlist.
- All queries via Prisma (parameterized) — no raw string concatenation, ever.
- `audit_log` write on every sensitive admin action (role change, permission change, product delete, threshold override).

## 9. Testing Strategy
- **Unit** (Jest): business logic, especially the dispense/locking function in isolation.
- **Integration** (Jest + Supertest): full API endpoints against a real test Postgres/Redis (via Docker).
- **Concurrency test**: fire N simultaneous dispense requests at 1 unit of stock, assert exactly one succeeds and stock never goes negative — this is the test that actually proves the "zero error" claim in the doc.
- **E2E** (Playwright): login → dispense → alert pops up → appears in audit trail, across the three panels.

## 10. Repo & Infra
```
/apps
  /api        NestJS backend
  /web        React frontend (admin/staff/shop route groups)
/packages
  /shared-types   DTOs/enums shared between api and web
docker-compose.yml   postgres + redis + api + web, one command local dev
.github/workflows    lint → test → build → migrate on merge
```
Deployment target (pick when you're ready): Railway/Render for fastest path, or AWS ECS + RDS + ElastiCache for a scale-out story later. Doesn't block early phases.

---

## Phased Roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **0 — Foundations** | Monorepo scaffold, Docker Compose (Postgres+Redis), NestJS + Prisma init, React+Vite init, CI skeleton | — |
| **1 — Auth & RBAC core** | users/roles/permissions/user_roles/role_permissions tables + migrations, JWT login/refresh/logout, Guards, seed script for default roles/permissions, React login + protected routing | Phase 0 |
| **2 — Catalog** | brands/categories/locations/products tables + CRUD APIs, Admin catalog management UI, search/filter | Phase 1 |
| **3 — Stock management** | inventory_stocks + CHECK constraint, stock_adjustments, restock/correction API, Admin stock dashboard | Phase 2 |
| **4 — Dispensing engine** | usage_logs, locked dispense transaction, Employee point-of-use UI (search/scan, qty+purpose+location form), insufficient-stock handling, **concurrency test** | Phase 3 |
| **5 — Real-time alerts** | Redis Pub/Sub channel, Socket.io gateway + Redis adapter, alerts_log, toast/modal in Admin & Employee UI, threshold config UI | Phase 4 |
| **6 — Customer panel** | Customer auth, cached public catalog browsing, product_reviews CRUD + moderation queue | Phase 2, 5 |
| **7 — Reporting & aggregation** | Product Details aggregation endpoint/page, audit_log + Admin audit view, usage reports, CSV export | Phase 4, 6 |
| **8 — Hardening & deploy** | Full security checklist pass, full test suite, structured logging/error tracking, CI/CD to real environment, backup strategy, docs | All above |

Each phase is independently demoable — by the end of Phase 4 you already have a working, race-condition-proof dispensing system; everything after that layers on visibility, trust, and polish.

## Deferred / optional (not needed for a correct v1)
- Batch/expiration-based recall workflows
- Multi-location stock transfer as one atomic operation (deferrable constraints)
- Redis Lua atomic decrement as a throughput optimization
- Barcode scanner hardware integration
- Native mobile app for the Employee panel
