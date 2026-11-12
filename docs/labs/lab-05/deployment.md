# Deployment & Cloud-Ready Architecture Guide

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Project:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Lab:** Lab 5 — Cloud Deployment and CI/CD Pipeline on Google Cloud Platform (GCP)  
> **Target Deployment:** Google Cloud Run (Single-Container Full-Stack Service) with Cloud SQL for PostgreSQL  
> **Authors:** Pilaiwan Churdchu (67070503492), Aphichaya Klinhual (67070503447)  

---

## 1. System Architecture & Stack Overview

The Whatsss application uses a modern, containerized full-stack architecture designed for serverless execution on Google Cloud Platform.

```mermaid
flowchart TD
    ClientBrowser["Client Browser / User Agent"]
    GCPGFE["Google Front End (GFE) / Cloud Run HTTPS Proxy"]
    
    subgraph CloudRunService ["Google Cloud Run Service (Single Container)"]
        direction TB
        ExpressServer["Express.js Server (Node.js 24)<br/>HOST: 0.0.0.0 | PORT: dynamic"]
        StaticServe["Static Asset Serving<br/>(express.static client/dist)"]
        SPAFallback["SPA Fallback Routing<br/>(GET * -> index.html)"]
        APIRouter["Express API Router<br/>(/api/*)"]
        API404["API 404 Catch-All<br/>(JSON 404 for unknown /api/*)"]
        HealthProbes["Health & Readiness Probes<br/>(/api/health, /api/ready)"]
    end
    
    subgraph PersistenceLayer ["Persistence Layer"]
        PrismaORM["Prisma Client ORM 5.x"]
        CloudSQL["PostgreSQL 16 Database<br/>(Cloud SQL / Container Instance)"]
    end

    ClientBrowser -->|"HTTPS (Port 443)"| GCPGFE
    GCPGFE -->|"HTTP (Container PORT)<br/>X-Forwarded-For, X-Forwarded-Proto"| ExpressServer
    ExpressServer -->|"Non-/api routes"| StaticServe
    StaticServe -->|"Route fallback"| SPAFallback
    ExpressServer -->|"/api/health & /api/ready"| HealthProbes
    ExpressServer -->|"/api/auth, /api/accounts, etc."| APIRouter
    ExpressServer -->|"Unmatched /api/*"| API404
    APIRouter --> PrismaORM
    HealthProbes -->|"SELECT 1 probe"| PrismaORM
    PrismaORM -->|"TCP / Unix Socket Connection"| CloudSQL
```

### 1.1 Technology Stack Summary
* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons. Built into static artifacts (`client/dist`).
* **Backend:** Node.js 24, Express, TypeScript, Prisma ORM. Built into CommonJS JavaScript in `server/dist`.
* **Database:** PostgreSQL 16 (relational schema enforcing ACID invariants, split allocation integrity, and account type rules).
* **Serving Topology:** Single-container deployment where the Express backend serves both the REST API endpoints (`/api/*`) and compiled static frontend assets (`client/dist`), with SPA fallback routing to `index.html` for client-side navigation.

---

## 2. Cloud-Ready 6-Point Architectural Audit

In preparation for cloud containerization and continuous deployment on GCP Cloud Run, the codebase satisfies the 6-point cloud-readiness baseline:

### Point 1: Stateless Disk Storage (No Local Uploaded Files)
* All application domain data (users, accounts, transactions, allocation lines) is persisted exclusively in PostgreSQL via Prisma ORM (`server/prisma/schema.prisma`).
* The application writes zero user-generated files to local container storage. Container filesystem is treated as strictly ephemeral and disposable.

### Point 2: Production-Safe Idempotent Database Seeding (`server/prisma/seed.ts`)
* **Production Admin Seeding:** Initial administrator creation is gated behind `process.env.NODE_ENV === 'production'`. Requires `SEED_ADMIN_PASSWORD` with a minimum length of 12 characters. If omitted or too short, seeding skips administrator provisioning with an explicit warning without crashing. Existing admins are preserved idempotently without mutating passwords or roles.
* **Production Evaluator / Demo User Seeding:** Because Whatsss does not expose a public user registration endpoint (`/register`) and administrative accounts are strictly forbidden from accessing financial transaction APIs under business rule `BR-10`, evaluators require a financial `USER` account. In production, demo user provisioning is enabled **only when explicitly requested** via `SEED_DEMO_DATA=true` and `SEED_DEMO_PASSWORD` (min 12 characters). It idempotently seeds `user_demo` with the 5 standard baseline financial accounts (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`).
* **Zero Hardcoded Secrets:** No hardcoded passwords or secrets are executed in production mode.

### Point 3: No Development Shortcuts in Production Builds
* Login page quick-fill demo credentials in `client/src/pages/LoginPage.tsx` are conditionally guarded by `import.meta.env.DEV`.
* In production builds (`npm run build`), Vite completely dead-code eliminates development helper buttons and pre-filled credentials.

### Point 4: Stateless Session Authentication
* Authentication utilizes stateless JSON Web Tokens (JWT) transported in secure `HttpOnly` cookies (`auth_token`).
* In production, cookies are flagged with `secure: true` (HTTPS only) and `sameSite: 'lax'`.
* User identity and active status are verified against PostgreSQL per request in `authGuard.ts`, allowing instant revocation by setting `is_active: false` without needing centralized session state storage (e.g. Redis).

### Point 5: Dynamic Port & Host Interface Binding & Environment Validation
* The Express server binds to `process.env.HOST || '0.0.0.0'` and `process.env.PORT || 5000`.
* In `server/src/config/env.ts`, strict startup validation guarantees that `PORT` is an integer between 1 and 65535, `CLIENT_URL` is a valid URL and required in production, and `DATABASE_URL` uses `postgresql://` or `postgres://` and is required in production. All error messages sanitize sensitive credentials.

### Point 6: Observability, Health & Readiness Probes
* **Reverse Proxy Trust:** Configured `app.set('trust proxy', 1)` in `server/src/app.ts` so Express accurately detects client protocols, client IP addresses, and secure HTTPS headers passed from Google Front End (GFE).
* **Liveness Probe (`GET /api/health`):** Returns HTTP 200 with `{ status: 'ok', timestamp: string, commitSha: string }`. Used by container orchestrators to verify container liveness without probing downstream databases.
* **Readiness Probe (`GET /api/ready`):** Executes an active database connectivity query (`prisma.$queryRaw\`SELECT 1\``). Returns HTTP 200 `{ status: 'ready', database: 'connected', ... }` when healthy, or HTTP 503 `{ status: 'not_ready', database: 'disconnected', error: 'Database connection unavailable', ... }` if PostgreSQL is unreachable.
* **Safe Observability & Credential Masking (CWE-532):** Any database exceptions are sanitized via `sanitizeLogMessage()` before writing to `console.error`. Connection strings (`postgresql://user:pass@host`), query parameters, and configured secrets are masked (`***`), preventing secret leakage to Google Cloud Logging. The client receives an opaque error payload.
* **API 404 vs SPA Routing Separation:** All unmatched `/api/*` routes are intercepted by a dedicated API 404 catch-all handler returning structured JSON 404 (`{"success": false, "error": {"code": "NOT_FOUND", ...}}`). Non-API routes serve static assets or fall back to `client/dist/index.html`.

---

## 3. Environment Variables Reference

| Variable Name | Required | Default / Example Value | Description | Scope |
|---|:---:|---|---|:---:|
| `PORT` | Optional | `5000` | Port number on which the HTTP server listens. Cloud Run sets this automatically to `8080`. Validated to be an integer between 1 and 65535. | Server |
| `HOST` | Optional | `0.0.0.0` | Host network interface to bind. Must remain `0.0.0.0` in container environments. | Server |
| `NODE_ENV` | **Required** | `production` (in cloud) / `development` (local) | Execution environment mode. Controls security policies and seed behavior. | Server |
| `CLIENT_URL` | **Required in Prod** | `https://<your-cloud-run-service-url>` (prod) / `http://localhost:5173` (dev) | Full public URL of the application. **Required in production for CSRF guard (C-04 / Issue #19):** `csrfGuard.ts` strictly validates incoming request `Origin` headers against `config.clientUrl` for all mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`). Even in single-container mode, browsers send `Origin: https://<cloud-run-url>`. Validated as a valid URL format upon startup. | Server |
| `DATABASE_URL` | **Required in Prod** | `postgresql://user:pass@host:5432/whatsss_db?schema=public` | PostgreSQL connection string used by Prisma ORM. Validated to start with `postgresql://` or `postgres://` and parse cleanly without leaking credentials. | Server |
| `JWT_SECRET` | **Required** | Strong random string (min 32 chars) | Cryptographic key used to sign and verify authentication JWTs. | Server |
| `JWT_EXPIRES_IN` | Optional | `24h` | Token validity duration. | Server |
| `APP_COMMIT_SHA` | Optional | `development` | Git commit SHA injected during CI/CD build, returned by `/api/health` and `/api/ready`. | Server |
| `SEED_ADMIN_PASSWORD`| Conditional | Secure password (min 12 chars) | Password for initial admin account when running seed in production. | Seed |
| `SEED_ADMIN_EMAIL` | Optional | `admin@whatsss.local` | Email address for initial admin account. | Seed |
| `SEED_DEMO_DATA` | Optional | `false` | When `'true'`, enables seeding of demo financial user (`user_demo`) in production. | Seed |
| `SEED_DEMO_PASSWORD`| Conditional | Secure password (min 12 chars) | Password for `user_demo` when `SEED_DEMO_DATA=true`. | Seed |
| `SEED_DEMO_EMAIL` | Optional | `user_demo@whatsss.local` | Email address for `user_demo`. | Seed |
| `VITE_API_BASE_URL` | Optional | Empty / relative `/api` in prod, `http://localhost:5000/api` in dev | Base URL for frontend Axios calls. | Client (Build-time) |

---

## 4. Runbook: Build, Test, Run, Migrate & Seed

> **Note on Directory Layout:** The repository does not use a single root `package.json` workspace. The frontend (`client/`) and backend (`server/`) maintain separate package dependencies and configurations. Commands below indicate the exact directory from which they must be executed.

### 4.1 Local Development Commands

```bash
# === From Repository Root ===

# 1. Start PostgreSQL container
docker compose up -d

# 2. Install client dependencies
cd client
npm install
cd ..

# 3. Install server dependencies & prepare database
cd server
npm install
npx prisma migrate dev
npm run prisma:seed # seeds user_demo, user_other, admin_demo
cd ..

# 4. Run automated test suites
cd server && npm test     # Backend unit & integration tests
cd ../client && npm test  # Frontend component & state tests
cd ..
```

### 4.2 Production Container & Build Commands

```bash
# === From Repository Root ===

# 1. Build frontend static bundle
cd client
npm run build
cd ..
# Output generated in client/dist

# 2. Build backend TypeScript
cd server
npm run build
# Output generated in server/dist

# 3. Run production database migration (apply pending schema changes)
npx prisma migrate deploy

# 4. Optional: Provision production accounts securely via environment variables
# Note: Seed execution uses tsx as configured in server/package.json ("prisma:seed": "tsx prisma/seed.ts").
SEED_ADMIN_PASSWORD="StrongProductionPassword2026!" \
SEED_DEMO_DATA="true" \
SEED_DEMO_PASSWORD="StrongDemoPassword2026!" \
NODE_ENV="production" \
npm run prisma:seed
# Alternatively: npx tsx prisma/seed.ts

# 5. Start production server (serves API and client/dist static bundle)
NODE_ENV="production" npm start
```

### 4.3 Migration & Seeding Container Runtime Architecture (Issue #17 Preparedness)

To guarantee that containerized production runs (Cloud Run Jobs or container entrypoints) can execute migrations and seeding without runtime package download failures:

1. **Production Dependencies Configuration:**
   - In `server/package.json`, both `prisma` (CLI) and `tsx` (TypeScript executor) are classified under `dependencies` (not `devDependencies`).
   - Consequently, running `npm ci --omit=dev` or `npm install --production` during Docker builds preserves `prisma` and `tsx` in `node_modules`, enabling offline migration deployment (`npx prisma migrate deploy`) and seeding (`npm run prisma:seed`).
   - Core runtime modules `@prisma/client` and `bcrypt` are likewise packaged in `dependencies`.

2. **Container Multi-Stage Structure (Issue #17 Checkpoint):**
   - The production Docker image must explicitly retain the `server/prisma/` directory:
     ```dockerfile
     COPY --from=builder /app/server/prisma ./server/prisma
     ```
     This ensures that `schema.prisma`, `migrations/`, and `seed.ts` are present in the final image.
   - During Issue #17 container verification, test that `npm run prisma:seed` and `npx prisma migrate deploy` execute successfully inside the built container without missing files or runtime module errors.
   - Migration and seed commands must be executed within the `server/` directory where `package.json` and `prisma/schema.prisma` reside.

---

## 5. Health & Readiness Probe Verification

### 5.1 Liveness Probe
```http
GET /api/health HTTP/1.1
Host: whatsss.example.com
```

**Expected Response (HTTP 200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-11-13T00:30:00.000Z",
  "commitSha": "f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d"
}
```

### 5.2 Readiness Probe (Database Connected)
```http
GET /api/ready HTTP/1.1
Host: whatsss.example.com
```

**Expected Response (HTTP 200 OK):**
```json
{
  "status": "ready",
  "database": "connected",
  "timestamp": "2026-11-13T00:30:00.000Z",
  "commitSha": "f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d"
}
```

**Degraded Response (HTTP 503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "database": "disconnected",
  "error": "Database connection unavailable",
  "timestamp": "2026-11-13T00:30:00.000Z",
  "commitSha": "f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d"
}
```
*(Any underlying database connection errors, such as socket terminations or connection strings, are sanitized via `sanitizeLogMessage()` and logged securely to the server console/Cloud Logging to protect sensitive credentials).*

### 5.3 Operational Distinction for Cloud Run Probe Configuration

When configuring Cloud Run service probes, configure endpoints strictly according to their intended operational role:

* **Liveness Probe $\rightarrow$ Configure `/api/health`:**
  - Verifies that the Node.js/Express process is responsive and event loops are unblocked.
  - Does **NOT** query PostgreSQL.
  - **Critical Failure Mode Avoided:** If a database experiences transient connection limits or network blips, the liveness probe continues returning HTTP 200. If liveness were mistakenly tied to the database, Cloud Run would kill and restart healthy container instances in a destructive cascading loop ("restart storm"), exacerbating the outage.
* **Startup / Readiness Probe $\rightarrow$ Configure `/api/ready`:**
  - Verifies active database connectivity (`SELECT 1`) during container initialization.
  - In Cloud Run, startup probes allow instances to warm up and establish database connection pools before receiving ingress traffic.
