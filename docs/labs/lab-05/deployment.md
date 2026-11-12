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

### Point 5: Dynamic Port & Host Interface Binding
* The Express server does not bind to hardcoded ports or loopback addresses.
* In `server/src/config/env.ts` and `server/src/index.ts`, the application binds to `process.env.HOST || '0.0.0.0'` and `process.env.PORT || 5000`, complying with Cloud Run container runtime requirements.

### Point 6: Observability, Health & Readiness Probes
* **Reverse Proxy Trust:** Configured `app.set('trust proxy', 1)` in `server/src/app.ts` so Express accurately detects client protocols, client IP addresses, and secure HTTPS headers passed from Google Front End (GFE).
* **Liveness Probe (`GET /api/health`):** Returns HTTP 200 with `{ status: 'ok', timestamp: string, commitSha: string }`. Used by container orchestrators to verify container liveness.
* **Readiness Probe (`GET /api/ready`):** Executes an active database connectivity query (`prisma.$queryRaw\`SELECT 1\``). Returns HTTP 200 `{ status: 'ready', database: 'connected', ... }` when healthy, or HTTP 503 `{ status: 'not_ready', database: 'disconnected', error: 'Database connection unavailable', ... }` if PostgreSQL is unreachable. Detailed database exceptions are logged internally via server error logs to prevent internal information leakage.
* **Single-Container Frontend Serving:** Static files from `client/dist` are served with caching headers, and non-`/api` requests fall back to `index.html`.

---

## 3. Environment Variables Reference

| Variable Name | Required | Default / Example Value | Description | Scope |
|---|:---:|---|---|:---:|
| `PORT` | Optional | `5000` | Port number on which the HTTP server listens. Cloud Run sets this automatically to `8080`. | Server |
| `HOST` | Optional | `0.0.0.0` | Host network interface to bind. Must remain `0.0.0.0` in container environments. | Server |
| `NODE_ENV` | **Required** | `production` (in cloud) / `development` (local) | Execution environment mode. Controls security policies and seed behavior. | Server |
| `CLIENT_URL` | **Required in Prod** | `https://<your-cloud-run-service-url>` (prod) / `http://localhost:5173` (dev) | Full public URL of the application. **Required in production for CSRF guard:** `csrfGuard.ts` strictly validates incoming request `Origin` headers against `config.clientUrl` for all mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`). Even in single-container mode, browsers send `Origin: https://<cloud-run-url>`. | Server |
| `DATABASE_URL` | **Required** | `postgresql://user:pass@host:5432/whatsss_db?schema=public` | PostgreSQL connection string used by Prisma ORM. | Server |
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
# The container migration/seed runtime in Issue #17 must provide tsx or execute via npm run prisma:seed.
SEED_ADMIN_PASSWORD="StrongProductionPassword2026!" \
SEED_DEMO_DATA="true" \
SEED_DEMO_PASSWORD="StrongDemoPassword2026!" \
NODE_ENV="production" \
npm run prisma:seed
# Alternatively: npx tsx prisma/seed.ts

# 5. Start production server (serves API and client/dist static bundle)
NODE_ENV="production" npm start
```

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
*(Detailed database query error messages are logged securely to the server console/logs rather than exposed in client-facing HTTP payloads).*
