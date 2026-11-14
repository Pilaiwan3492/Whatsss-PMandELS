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
        ExpressServer["Express.js Server (Node.js 24 LTS)<br/>HOST: 0.0.0.0 | PORT: dynamic"]
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
* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons. Built into static artifacts (`client/dist`). Engine standard: Node.js 24 LTS.
* **Backend:** Node.js 24 LTS, Express, TypeScript, Prisma ORM 5.x. Built into CommonJS JavaScript in `server/dist`. Standardized across `.nvmrc` (`24`), `server/package.json` & `client/package.json` engines (`>=24.0.0`), `Dockerfile` (`node:24-alpine`), and GitHub Actions CI runners (`node-version: 24`).
* **Database:** PostgreSQL 16 (relational schema enforcing ACID invariants, split allocation integrity, and account type rules).
* **Serving Topology:** Single-container deployment where the Express backend serves both the REST API endpoints (`/api/*`) and compiled static frontend assets (`client/dist`), with SPA fallback routing to `index.html` for client-side navigation.

### 1.2 Runtime Requirements
* **Node.js 24 LTS** (verified across `.nvmrc`, `package.json`, `Dockerfile`, and CI workflows)
* **npm** version provided with the supported Node.js 24 runtime
* **Docker Engine** with Docker Compose plugin
* **PostgreSQL 16** (Docker deployment / Cloud SQL)

### 1.3 Database Deployment
1. Configure the production environment variables.
2. Verify `DATABASE_URL` and database connectivity (ensuring any special characters in credentials are URL-encoded).
3. Run Prisma migrations using `prisma migrate deploy`.
4. Run the approved seed procedure (`npm run prisma:seed`).
5. Start the application only after migrations complete (`condition: service_completed_successfully`).
6. Verify `/api/health` and `/api/ready`.

### 1.4 Data Persistence
The PostgreSQL data directory is backed by the `whatsss_pgdata` named volume. Normal shutdown must use `docker compose down` without the `-v` option to preserve database data across restarts.

---

## 2. Cloud-Ready 6-Point Architectural Audit

In preparation for cloud containerization and continuous deployment on GCP Cloud Run, the codebase satisfies the 6-point cloud-readiness baseline:

### Point 1: Stateless Disk Storage (No Local Uploaded Files)
* All application domain data (users, accounts, transactions, allocation lines) is persisted exclusively in PostgreSQL via Prisma ORM (`server/prisma/schema.prisma`).
* The application writes zero user-generated files to local container storage. Container filesystem is treated as strictly ephemeral and disposable.

### Point 2: Production-Safe Idempotent Database Seeding (`server/prisma/seed.ts`)
* **Production Admin Seeding:** Initial administrator creation is gated behind `process.env.NODE_ENV === 'production'`. Requires `SEED_ADMIN_PASSWORD` with a minimum length of 12 characters. If omitted or too short, seeding skips administrator provisioning with an explicit warning without crashing. Existing admins are preserved idempotently without mutating passwords or roles. Verifies username and email collisions against non-ADMIN users before provisioning.
* **Production Evaluator / Demo User Seeding & Role Protection:** Because Whatsss does not expose a public user registration endpoint (`/register`) and administrative accounts are strictly forbidden from accessing financial transaction APIs under business rule `BR-10`, evaluators require a financial `USER` account. In production, demo user provisioning is enabled **only when explicitly requested** via `SEED_DEMO_DATA=true` and `SEED_DEMO_PASSWORD` (min 12 characters):
  - **Role Integrity Verification:** If `user_demo` already exists and its role is `USER`, the seed reuses the account without mutating credentials or role. If `user_demo` exists with a non-USER role (e.g. `ADMIN`), the seed immediately aborts with a fatal error, preventing role modification or accidental financial account creation for administrative users.
  - **Email Conflict Prevention:** If the configured email is already taken by another username, the seed aborts immediately with a clear error without overwriting or adopting the existing account.
  - **Strict Account Association (BR-10 Compliance):** Standard baseline financial accounts (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`) are provisioned exclusively for accounts with role `USER`. Non-USER and administrative accounts are strictly prohibited from possessing financial accounts.
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
* **Template Placeholder Rejection (CWE-1188 / Security Baseline):** Both the runtime server (`validateJwtSecret`) and seed process (`isPlaceholderPassword`) actively detect and reject `.env.example` placeholder strings (e.g. `replace_with_*`, `changeme`). If an operator copies `.env.example` without substituting real cryptographic secrets, the application immediately aborts startup with an explicit fatal error rather than running insecurely with known secrets.
* **Docker Compose Required Interpolation:** `docker-compose.yml` does not provide hardcoded default secret fallbacks. Secrets use required interpolation syntax (e.g. `${JWT_SECRET:?JWT_SECRET must be configured in .env}` and `${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD must be configured in .env}`), failing fast before container startup if secrets are omitted.

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

### 5.3 Operational Distinction for Cloud Run Probe Configuration vs Docker Compose

When configuring service probes, operational semantics are decoupled between process liveness and dependency readiness:

* **Docker Compose Container Healthcheck (`docker-compose.yml`):**
  - Uses `curl -f http://localhost:8080/api/health || exit 1`.
  - Verifies that the Node.js application process and HTTP event loop are alive and answering requests.
  - Does **not** include `/api/ready` in the container-level healthcheck: this ensures that if PostgreSQL is stopped or restarted, Docker does not prematurely mark the application container unhealthy or trigger unwanted restarts, giving database connections the opportunity to recover cleanly.

* **Database Readiness Inspection (`/api/ready`):**
  - Serves as the dedicated endpoint for database connectivity verification (`SELECT 1`).
  - Returns **HTTP 200 OK** (`database: connected`) when PostgreSQL is healthy.
  - Returns **HTTP 503 Service Unavailable** (`database: disconnected`) when PostgreSQL is unavailable or failing.
  - Tested continuously in CI: simulates database outage (`docker compose stop postgres` $\rightarrow$ 503 while liveness remains 200) followed by database recovery (`docker compose start postgres` $\rightarrow$ 200).

* **Google Cloud Run Decoupled Probes (Production Architecture):**
  - **Liveness Probe $\rightarrow$ Configure `/api/health`:** Verifies that the Node.js process and Express event loop are alive. Does **NOT** query PostgreSQL. **Critical Failure Mode Avoided:** If Cloud SQL undergoes transient maintenance, connection limit spikes, or failover, the liveness probe remains HTTP 200. If liveness were tied to the database, Cloud Run would kill and restart healthy container instances in a destructive cascading loop ("restart storm"), exacerbating the outage.
  - **Startup / Readiness Probe $\rightarrow$ Configure `/api/ready`:** Verifies active database connectivity (`SELECT 1`). Allows Cloud Run instances to complete initialization before GFE routes public ingress traffic.

---

## 6. Cloud Run Deployment & Cloud SQL Integration Runbook

### 6.0 Deployed GCP Environment & Non-Secret Resource Inventory (Episode 5 / Issue #19)

| Resource Category | GCP Resource Identifier / Configuration | Security & Cost Controls |
|---|---|---|
| **GCP Project ID** | `cpe334-whatsss-pmandels` (Project Number: `1086708130644`) | Enabled APIs: `artifactregistry`, `run`, `sqladmin`, `secretmanager`, `iamcredentials`, `cloudbuild` |
| **GCP Region** | `asia-southeast1` (Singapore) | Co-located Cloud Run, Cloud SQL, and Artifact Registry |
| **Artifact Registry** | `asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss` | Docker repository storing immutable `whatsss:<commit-sha>` images |
| **Cloud SQL Instance** | `whatsss-sql` (`cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql`) | `POSTGRES_16`, `Enterprise` edition, `db-f1-micro`, `10GB SSD`, **`--no-storage-auto-increase` enabled** |
| **Cloud SQL Database & User** | Database: `whatsss_db` \| Dedicated User: `whatsss_app` | Accessed via built-in Cloud SQL Auth Proxy Unix socket (`/cloudsql/...`) |
| **Runtime Service Account** | `whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com` | **Least Privilege (R-07):** `roles/cloudsql.client` (project) + `roles/secretmanager.secretAccessor` on the 4 application secrets only (zero `Owner`/`Editor` roles) |
| **Secret Manager Secrets** | `whatsss-database-url`, `whatsss-jwt-secret`, `whatsss-admin-password`, `whatsss-demo-password` | **Names only (R-04):** Secret values are never stored in Git, Dockerfiles, or documentation |
| **Migration & Seed Job** | `whatsss-migrate` (Latest verified execution: `whatsss-migrate-rmqkv`) | Decoupled Cloud Run Job running `npx prisma migrate deploy && npm run prisma:seed` (`--wait`) prior to service rollout |
| **Cloud Run Service** | `whatsss` (Active revision: `whatsss-00006-9jl`) | `--min-instances=0`, `--max-instances=3`, `--port=8080`, `NODE_ENV=production`, `HOST=0.0.0.0`, Pinned secrets: `whatsss-database-url:1`, `whatsss-jwt-secret:1`, `whatsss-admin-password:1`, `whatsss-demo-password:1` |
| **Live Public Cloud Run URLs** | Primary (`CLIENT_URL`): `https://whatsss-sipqw4logq-as.a.run.app`<br/>Regional Endpoint: `https://whatsss-1086708130644.asia-southeast1.run.app` | `CLIENT_URL` synchronized with primary HTTPS URL so `csrfGuard.ts` strict `Origin` check passes |

### 6.1 Automated Infrastructure & Release Scripts (`deploy/deploy.sh` & `deploy/release.sh`)
Two repeatable deployment scripts in `deploy/` automate first-time infrastructure provisioning and subsequent releases:
1. **`deploy/deploy.sh` (First-Time Provisioning + Build + Release):**
   - Verifies required CLI dependencies (`gcloud`, `docker`, `python3`, `git`, `openssl`) and requires an explicit `GCP_PROJECT_ID` (with active-project mismatch protection).
   - Supports dry-run inspection (`DRY_RUN=1 GCP_PROJECT_ID="cpe334-whatsss-pmandels" bash deploy/deploy.sh`) to verify all commands without mutating GCP state or leaking secret values.
   - URL-encodes both `DB_USER` and `DB_PASSWORD` via RFC 3986 `urllib.parse.quote(val, safe="")` before constructing `DATABASE_URL_VALUE` (`postgresql://${DB_USER_ENCODED}:${DB_PASSWORD_ENCODED}@localhost:5432/...`), preserving URI delimiters while safely encoding `@`, `#`, `/`, `:`, and `%`.
   - Enforces fail-closed IAM verification (`gcloud projects get-iam-policy` and `gcloud secrets get-iam-policy`): reading failures halt deployment immediately (`exit 1`); confirms `whatsss-runner` holds only `roles/cloudsql.client` at project level and `roles/secretmanager.secretAccessor` on the 4 secrets; strictly rejects excessive roles (`roles/owner`, `roles/editor`, `roles/storage.admin`, or project-wide Secret Accessor).
   - Implements idempotent credential preservation: preserves existing synchronized Cloud SQL user passwords and Secret Manager versions during normal deploy (`ROTATE_DB_PASSWORD=0`). Automatic in-place rotation via `deploy.sh` is disabled (`ROTATE_DB_PASSWORD=1` fails closed immediately) to prevent desynchronization; database password maintenance must follow the documented manual rotation procedure with safe rollback below.
2. **`deploy/release.sh` (Decoupled Migration Job + Cloud Run Service Rollout — Issue #19 & Issue #21 CD Contract):**
   - Designed to be invoked both by `deploy/deploy.sh` (Episode 5) and by the GitHub Actions Continuous Deployment workflow (`.github/workflows/deploy.yml` in Episode 7 / Issue #21) using the immutable Docker image built from the verified commit SHA without rebuilding.
   - Enforces strict input validation: `APP_COMMIT_SHA` must be a full 40-character Git commit SHA (`^[0-9a-f]{40}$`), `IMAGE_REF` must be an immutable Docker image digest (`@sha256:[0-9a-f]{64}$`), and all secret versions must be explicit, numeric, and in verified `ENABLED` state via `gcloud secrets versions describe`.

#### Comprehensive Deployment Script Environment Variables

The table below documents all environment variables accepted by `deploy/deploy.sh` and `deploy/release.sh`:

| Variable Name | Type | Default Value | Required? | Description & Operational Contract |
|---|---|---|---|---|
| `GCP_PROJECT_ID` | String | *(None)* | **Yes** | Target Google Cloud Project ID (`cpe334-whatsss-pmandels`). Fails fast if omitted or if different from active `gcloud` project (unless overridden by `CONFIRM_PROJECT=1`). |
| `GCP_REGION` | String | `asia-southeast1` | No | Deployment region for Artifact Registry, Cloud SQL, Cloud Run Job, and Cloud Run Service. |
| `DRY_RUN` | `0` or `1` | `0` | No | Dry-run mode (`1` = log commands only with zero GCP mutations and zero secret leaks; `0` = live execution). |
| `APP_COMMIT_SHA` | 40-hex | Auto-detected from `git rev-parse HEAD` | **Yes** in `release.sh` | Full 40-character Git commit SHA (`^[0-9a-f]{40}$`) passed as build-arg and container metadata. |
| `IMAGE_REF` | String | Auto-resolved digest in `deploy.sh` | **Yes** in `release.sh` | Immutable Docker image reference pinned to `@sha256:[0-9a-f]{64}$`. Tag-based references are strictly rejected. |
| `APP_NAME` | String | `whatsss` | No | Base application name used for Docker repository and container resource labeling. |
| `RUNTIME_SA_NAME` | String | `whatsss-runner` | No | Name of the dedicated least-privilege runtime service account. |
| `RUNTIME_SA_EMAIL` | String | `whatsss-runner@${PROJECT_ID}.iam.gserviceaccount.com` | No | Full email of the runtime service account. Verified against project and secret IAM policies. |
| `AR_REPO` | String | `whatsss` | No | Artifact Registry Docker repository name. |
| `SQL_INSTANCE` | String | `whatsss-sql` | No | Cloud SQL PostgreSQL 16 instance name. |
| `SQL_TIER` | String | `db-f1-micro` | No | Machine tier for Cloud SQL (`db-f1-micro` for CPE 334 credit protection). |
| `SQL_EDITION` | String | `enterprise` | No | Cloud SQL edition (`enterprise`). |
| `SQL_DB_VERSION` | String | `POSTGRES_16` | No | Database engine version (`POSTGRES_16`). |
| `DB_NAME` | String | `whatsss_db` | No | Application PostgreSQL database name. |
| `DB_USER` | String | `whatsss_app` | No | Dedicated non-root database user name. |
| `WHATSSS_DB_PASSWORD` | String | Auto-generated 32-char hex | No | Initial database password. Safely URL-encoded via RFC 3986 python helper before assembling `DATABASE_URL`. |
| `WHATSSS_JWT_SECRET` | String | Auto-generated 32-byte hex | No | Initial JWT signing secret key (minimum 32 cryptographically random characters). |
| `WHATSSS_ADMIN_PASSWORD` | String | Auto-generated `Admin_<hex>!` | No | Initial bootstrap password for `admin` account. |
| `WHATSSS_DEMO_PASSWORD` | String | Auto-generated `Demo_<hex>!` | No | Initial bootstrap password for seeded `user_demo` account. |
| `SECRET_DB_URL` | String | `whatsss-database-url` | No | Secret Manager secret name holding the full PostgreSQL Unix socket connection URL. |
| `SECRET_DB_URL_VERSION` | Numeric | Auto-resolved latest `ENABLED` version | No | Explicit pinned version number for `whatsss-database-url` (e.g., `1`). Verified `ENABLED`. |
| `SECRET_JWT` | String | `whatsss-jwt-secret` | No | Secret Manager secret name holding the JWT signing key. |
| `SECRET_JWT_VERSION` | Numeric | Auto-resolved latest `ENABLED` version | No | Explicit pinned version number for `whatsss-jwt-secret` (e.g., `1`). Verified `ENABLED`. |
| `SECRET_ADMIN_PWD` | String | `whatsss-admin-password` | No | Secret Manager secret name holding the initial admin bootstrap password. |
| `SECRET_ADMIN_PWD_VERSION` | Numeric | Auto-resolved latest `ENABLED` version | No | Explicit pinned version number for `whatsss-admin-password` (e.g., `1`). Verified `ENABLED`. |
| `SECRET_DEMO_PWD` | String | `whatsss-demo-password` | No | Secret Manager secret name holding the seeded `user_demo` password. |
| `SECRET_DEMO_PWD_VERSION` | Numeric | Auto-resolved latest `ENABLED` version | No | Explicit pinned version number for `whatsss-demo-password` (e.g., `1`). Verified `ENABLED`. |
| `MIGRATE_JOB_NAME` | String | `whatsss-migrate` | No | Decoupled Cloud Run Job name executing Prisma migrations and seed prior to service rollout. |
| `CLOUD_RUN_SERVICE` | String | `whatsss` | No | Cloud Run Service name serving production HTTP traffic. |
| `ROTATE_DB_PASSWORD` | `0` or `1` | `0` | No | Database password rotation guard. Must remain `0`. Setting to `1` fails closed immediately before executing any GCP mutations. |
| `ROTATE_APP_SECRETS` | `0` or `1` | `0` | No | When set to `1`, forces creating new Secret Manager versions for JWT, Admin, and Demo secrets. |
| `FORCE_IAM_BINDING` | `0` or `1` | `0` | No | When set to `1`, forces re-binding IAM policies even if already present. |
| `CONFIRM_PROJECT` | `0` or `1` | `0` | No | When set to `1`, overrides the active `gcloud` project mismatch safety guard. |
| `SEED_DEMO_DATA` | String | `true` | No | Passed to `release.sh` to trigger `npm run prisma:seed` in `whatsss-migrate`. |

#### Architectural Deviation — Docker CLI vs. Cloud Build
The Whatsss deployment workflow deliberately employs `docker build` + `docker push` (authenticated via `gcloud auth configure-docker asia-southeast1-docker.pkg.dev`) rather than remote `gcloud builds submit`. This engineering choice provides three distinct advantages:
1. **Multi-Stage Build Cache Reuse:** Reuses local Docker layer caching across iterations for the multi-stage Node.js 24 build (`client-builder`, `server-builder`, and production `runner`), avoiding redundant npm package downloads.
2. **Deterministic Build-Time Argument Injection:** Directly passes local Git metadata (`VITE_API_BASE_URL=/api` and `APP_COMMIT_SHA="$(git rev-parse HEAD)"`) without uploading uncommitted development files or temporary scratch files to Google Cloud Storage buckets.
3. **Reproducibility & Test Portability:** Allows developers and automated test harnesses (`deploy/tests/test-deploy.sh` and `deploy/tests/test-release.sh`) to exercise identical container build and release contracts across local development, CI runners, and Cloud Shell without requiring separate Cloud Build service account roles.

#### Manual Maintenance Database Password Rotation Procedure (with Safe Rollback)

> [!CAUTION]
> **Potential Service Downtime Warning:** Changing the database password on an active single-user Cloud SQL account (`whatsss_app`) creates a temporary credential mismatch during propagation. Existing Cloud Run container instances will continue attempting database queries using the previous password until the new revision is fully deployed and old instances are drained. **Never refer to this procedure as "atomic" or "zero-downtime".** Perform this maintenance strictly during a scheduled maintenance window.

When business or security policies require rotating the Cloud SQL password, execute this hardened runbook (also available as executable script at [`deploy/rotate-db-password.sh`](file:///c:/Users/User/Downloads/group_work_specs_v1/Whatsss-PMandELS/deploy/rotate-db-password.sh)). It includes `set -euo pipefail`, pre-validation of Cloud Run state before any mutations, automatic cleanup via shell `trap`, an active `ERR` trap ensuring that any failure after Cloud SQL password change enters rollback, and explicit reporting if rollback itself fails:

```bash
#!/usr/bin/env bash
# ==============================================================================
# Hardened Manual Cloud SQL Password Rotation Runbook (with Automated Rollback)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${GCP_PROJECT_ID:-cpe334-whatsss-pmandels}"
REGION="${GCP_REGION:-asia-southeast1}"
INSTANCE="${SQL_INSTANCE:-whatsss-sql}"
DB_USER="${DB_USER:-whatsss_app}"
DB_NAME="${DB_NAME:-whatsss_db}"
SECRET_NAME="${SECRET_DB_URL:-whatsss-database-url}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-whatsss}"
JWT_SECRET_VERSION="${JWT_SECRET_VERSION:-1}"
ADMIN_PASSWORD_VERSION="${ADMIN_PASSWORD_VERSION:-1}"
DEMO_PASSWORD_VERSION="${DEMO_PASSWORD_VERSION:-1}"

# Automatic cleanup trap: ensures temporary secret files are shredded upon exit, error, or interruption
TMP_BACKUP=""
TMP_NEW_SECRET=""
# shellcheck disable=SC2329
cleanup_temp_files() {
  if [[ -n "${TMP_NEW_SECRET:-}" && -f "${TMP_NEW_SECRET}" ]]; then
    shred -u "${TMP_NEW_SECRET}" 2>/dev/null || rm -f "${TMP_NEW_SECRET}"
  fi
  if [[ -n "${TMP_BACKUP:-}" && -f "${TMP_BACKUP}" ]]; then
    shred -u "${TMP_BACKUP}" 2>/dev/null || rm -f "${TMP_BACKUP}"
  fi
}
trap cleanup_temp_files EXIT INT TERM

# Rollback procedure: triggered on ANY error after Cloud SQL password has been altered
# shellcheck disable=SC2329
rollback_rotation() {
  trap - ERR
  set +e
  local exit_reason="${1:-Unknown failure occurred during post-rotation deployment or verification}"
  echo "CRITICAL: Database password rotation failed: ${exit_reason}" >&2
  echo "CRITICAL: Initiating automated rollback to restore operational service..." >&2

  local rb_failed=0

  # Step 1: Restore original Cloud SQL user password from backup
  local prev_pwd=""
  if [[ -n "${TMP_BACKUP:-}" && -f "${TMP_BACKUP}" ]]; then
    prev_pwd="$(python3 -c '
import sys, urllib.parse
raw = open(sys.argv[1]).read().strip()
parsed = urllib.parse.urlsplit(raw)
print(urllib.parse.unquote(parsed.password or ""))
' "${TMP_BACKUP}" 2>/dev/null || true)"
  fi

  if [[ -z "${prev_pwd}" ]]; then
    echo "FATAL: Rollback cannot recover previous database password from backup file." >&2
    rb_failed=1
  else
    echo "Rollback: Restoring Cloud SQL user '${DB_USER}' password..." >&2
    if ! gcloud sql users set-password "${DB_USER}" \
      --instance="${INSTANCE}" \
      --password="${prev_pwd}" \
      --project="${PROJECT_ID}"; then
      echo "FATAL: Rollback failed to restore Cloud SQL user password!" >&2
      rb_failed=1
    fi
  fi

  # Step 2: Redeploy Cloud Run service pinned to original numeric secret version
  echo "Rollback: Redeploying Cloud Run service pinned to secret version ${CURRENT_VER}..." >&2
  if ! (
    GCP_PROJECT_ID="${PROJECT_ID}" \
    GCP_REGION="${REGION}" \
    APP_COMMIT_SHA="${COMMIT_SHA}" \
    IMAGE_REF="${IMAGE_DIGEST}" \
    DB_URL_VERSION="${CURRENT_VER}" \
    JWT_SECRET_VERSION="${JWT_SECRET_VERSION}" \
    ADMIN_PASSWORD_VERSION="${ADMIN_PASSWORD_VERSION}" \
    DEMO_PASSWORD_VERSION="${DEMO_PASSWORD_VERSION}" \
    bash "${SCRIPT_DIR}/release.sh"
  ); then
    echo "FATAL: Rollback failed to redeploy Cloud Run service on secret version ${CURRENT_VER}!" >&2
    rb_failed=1
  fi

  if [[ "${rb_failed}" -eq 1 ]]; then
    echo "FATAL ROLLBACK FAILURE: Automated rollback could not fully restore the system. Immediate manual intervention required." >&2
    exit 2
  fi

  echo "Rollback completed successfully. Restored operational service on secret version ${CURRENT_VER}." >&2
  exit 1
}

# ------------------------------------------------------------------------------
# Phase 1: Preparation & State Pre-Validation (BEFORE Any Mutation)
# ------------------------------------------------------------------------------
echo "=== Phase 1: Resolving current active secret version, service state & backing up payload ==="
CURRENT_VER="$(gcloud secrets versions list "${SECRET_NAME}" \
  --project="${PROJECT_ID}" \
  --filter="state:ENABLED" \
  --format="value(name)" \
  --sort-by="~create_time" | head -n 1)"
CURRENT_VER="${CURRENT_VER##*/}"

if [[ -z "${CURRENT_VER}" || ! "${CURRENT_VER}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Unable to resolve numeric active version for secret '${SECRET_NAME}'." >&2
  exit 1
fi
echo "Current active database secret version: ${CURRENT_VER}"

# Pre-validate Cloud Run image digest and commit SHA BEFORE modifying anything
IMAGE_DIGEST="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(spec.template.spec.containers[0].image)')"
COMMIT_SHA="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(spec.template.spec.containers[0].env[?(@.name=="APP_COMMIT_SHA")].value)')"

if [[ -z "${IMAGE_DIGEST}" || -z "${COMMIT_SHA}" ]]; then
  echo "ERROR: Unable to resolve active Cloud Run image digest or commit SHA before rotation." >&2
  exit 1
fi

TMP_BACKUP="$(mktemp)"
chmod 600 "${TMP_BACKUP}"
gcloud secrets versions access "${CURRENT_VER}" --secret="${SECRET_NAME}" --project="${PROJECT_ID}" > "${TMP_BACKUP}"

# ------------------------------------------------------------------------------
# Phase 2: Generate New Credentials & Add Secret Manager Version (BEFORE modifying DB)
# ------------------------------------------------------------------------------
echo "=== Phase 2: Staging new secret version in Secret Manager ==="
NEW_PASSWORD="$(openssl rand -base64 24 | tr -d '\n+/=' | head -c 24)"
NEW_PASSWORD_ENCODED="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${NEW_PASSWORD}")"
NEW_DB_URL="postgresql://${DB_USER}:${NEW_PASSWORD_ENCODED}@localhost:5432/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${INSTANCE}&schema=public"

TMP_NEW_SECRET="$(mktemp)"
chmod 600 "${TMP_NEW_SECRET}"
printf '%s' "${NEW_DB_URL}" > "${TMP_NEW_SECRET}"

# [FAILURE GUARD 1]: If adding secret version fails, abort immediately BEFORE modifying Cloud SQL
if ! gcloud secrets versions add "${SECRET_NAME}" \
  --data-file="${TMP_NEW_SECRET}" \
  --project="${PROJECT_ID}"; then
  echo "ERROR: Failed to add new version to Secret Manager '${SECRET_NAME}'." >&2
  echo "Cloud SQL password remains untouched. No service disruption occurred." >&2
  exit 1
fi
shred -u "${TMP_NEW_SECRET}" 2>/dev/null || rm -f "${TMP_NEW_SECRET}"
TMP_NEW_SECRET=""

NEW_VER="$(gcloud secrets versions list "${SECRET_NAME}" \
  --project="${PROJECT_ID}" \
  --filter="state:ENABLED" \
  --format="value(name)" \
  --sort-by="~create_time" | head -n 1)"
NEW_VER="${NEW_VER##*/}"

if [[ -z "${NEW_VER}" || ! "${NEW_VER}" =~ ^[0-9]+$ || "${NEW_VER}" -le "${CURRENT_VER}" ]]; then
  echo "ERROR: New secret version staging failed verification. Expected numeric version > ${CURRENT_VER}." >&2
  exit 1
fi
echo "New database secret version staged: ${NEW_VER}"

# ------------------------------------------------------------------------------
# Phase 3: Update Cloud SQL User Password & Arm Rollback Error Trap
# ------------------------------------------------------------------------------
echo "=== Phase 3: Updating Cloud SQL user '${DB_USER}' password ==="
# [FAILURE GUARD 2]: If setting Cloud SQL password fails, abort before triggering release.sh
if ! gcloud sql users set-password "${DB_USER}" \
  --instance="${INSTANCE}" \
  --password="${NEW_PASSWORD}" \
  --project="${PROJECT_ID}"; then
  echo "ERROR: Failed to update password for Cloud SQL user '${DB_USER}'." >&2
  echo "Cloud Run service is still referencing active secret version ${CURRENT_VER}." >&2
  echo "Destroying unused staged secret version ${NEW_VER}..." >&2
  gcloud secrets versions destroy "${NEW_VER}" --secret="${SECRET_NAME}" --project="${PROJECT_ID}" --quiet || true
  exit 1
fi
unset NEW_PASSWORD NEW_PASSWORD_ENCODED NEW_DB_URL

# CRITICAL SAFETY: Arm the automated rollback trap for ANY subsequent failure
trap 'rollback_rotation "Command on line $LINENO ($BASH_COMMAND) failed"' ERR

# ------------------------------------------------------------------------------
# Phase 4: Deploy Cloud Run Revision with Explicit Numeric Secret Versions
# ------------------------------------------------------------------------------
echo "=== Phase 4: Releasing Cloud Run service with new secret version ${NEW_VER} ==="
GCP_PROJECT_ID="${PROJECT_ID}" \
GCP_REGION="${REGION}" \
APP_COMMIT_SHA="${COMMIT_SHA}" \
IMAGE_REF="${IMAGE_DIGEST}" \
DB_URL_VERSION="${NEW_VER}" \
JWT_SECRET_VERSION="${JWT_SECRET_VERSION}" \
ADMIN_PASSWORD_VERSION="${ADMIN_PASSWORD_VERSION}" \
DEMO_PASSWORD_VERSION="${DEMO_PASSWORD_VERSION}" \
bash "${SCRIPT_DIR}/release.sh"

# ------------------------------------------------------------------------------
# Phase 5: Verification of Health and Readiness Probes
# ------------------------------------------------------------------------------
echo "=== Phase 5: Verifying /api/health and /api/ready probes ==="
SERVICE_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
if [[ -z "${SERVICE_URL}" || ! "${SERVICE_URL}" =~ ^https:// ]]; then
  rollback_rotation "Cloud Run service URL is missing or non-HTTPS: '${SERVICE_URL:-}'"
fi

HEALTH_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" || echo "000")"
READY_STATUS="$(curl -s "${SERVICE_URL}/api/ready" || echo "")"

if [[ "${HEALTH_STATUS}" != "200" || "${READY_STATUS}" != *'"database":"connected"'* ]]; then
  rollback_rotation "Health or readiness probes failed (health: ${HEALTH_STATUS}, ready: ${READY_STATUS})"
fi

# Disarm ERR trap on verified success
trap - ERR
echo "SUCCESS: Password rotation verified! Active secret version: ${NEW_VER}"
exit 0
```
```

### 6.2 Creating Secrets in GCP Secret Manager
Never commit database credentials or JWT secrets to Git, Dockerfiles, or environment files. Manage all production secrets via Google Cloud Secret Manager:

```bash
# 1. Create secret for Database Connection String
# Unix Socket format for Cloud Run + Cloud SQL built-in proxy:
echo -n "postgresql://whatsss_app:DB_PASSWORD@localhost:5432/whatsss_db?host=/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql&schema=public" | \
  gcloud secrets create whatsss-database-url --data-file=-

# 2. Create secret for JWT Signing Key (must be at least 32 cryptographically random characters)
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create whatsss-jwt-secret --data-file=-

# 3. Create secrets for idempotent production bootstrap (admin and evaluator user_demo)
echo -n "REPLACE_WITH_STRONG_ADMIN_PASSWORD" | \
  gcloud secrets create whatsss-admin-password --data-file=-

echo -n "REPLACE_WITH_STRONG_DEMO_PASSWORD" | \
  gcloud secrets create whatsss-demo-password --data-file=-
```

### 6.3 Service Account & Least-Privilege IAM Roles (R-07)
The Cloud Run runtime service account (`whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com`) is granted strictly least-privilege IAM roles (bound by the Project Owner):

```bash
# Cloud SQL Client: Allows connecting to Cloud SQL via unix socket proxy
gcloud projects add-iam-policy-binding cpe334-whatsss-pmandels \
  --member="serviceAccount:whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client" \
  --condition=None

# Secret Manager Secret Accessor: Scoped strictly to the 4 runtime/seed secrets
for sec in whatsss-database-url whatsss-jwt-secret whatsss-admin-password whatsss-demo-password; do
  gcloud secrets add-iam-policy-binding "${sec}" \
    --member="serviceAccount:whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project="cpe334-whatsss-pmandels"
done
```

### 6.4 Decoupled Release Step: Migration & Seed via Cloud Run Job
Do **NOT** embed `npx prisma migrate deploy` into the application container startup (`npm start`). In serverless environments, Cloud Run can spin up multiple container instances concurrently during scale-out events, leading to database schema deadlocks or migration collisions.

Instead, execute migrations and idempotent seeding as a decoupled, isolated Cloud Run Job (`whatsss-migrate`) prior to routing user traffic:

> [!NOTE] Legacy / Manual Baseline Example
> The snippet below illustrates the manual baseline commands. In our automated continuous deployment pipeline (`.github/workflows/deploy.yml` and `deploy/release.sh`), mutable tags and `:latest` secret references are strictly prohibited. The production deployment pipeline uses immutable image digests (`@sha256:...`) and explicit positive integer secret versions (e.g., `:1`) validated from the GitHub `demo` environment.

```bash
# Create or update Cloud Run Job for schema migration and idempotent seed
gcloud run jobs deploy whatsss-migrate \
  --image="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss:TAG" \
  --region="asia-southeast1" \
  --project="cpe334-whatsss-pmandels" \
  --service-account="whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com" \
  --set-cloudsql-instances="cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql" \
  --set-env-vars="NODE_ENV=production,SEED_DEMO_DATA=true" \
  --set-secrets="DATABASE_URL=whatsss-database-url:latest,SEED_ADMIN_PASSWORD=whatsss-admin-password:latest,SEED_DEMO_PASSWORD=whatsss-demo-password:latest" \
  --max-retries=1 \
  --task-timeout=300s \
  --command="sh" \
  --args="-c,npx prisma migrate deploy && npm run prisma:seed"

# Execute migration job synchronously and wait for completion before deploying service
gcloud run jobs execute whatsss-migrate --region="asia-southeast1" --project="cpe334-whatsss-pmandels" --wait
```

### 6.5 Deploying Application Service to Cloud Run
Once the migration job completes successfully, deploy the application service:

> [!NOTE] Legacy / Manual Baseline Example
> As with the migration job above, the automated CD pipeline (`deploy/release.sh`) replaces `:TAG` with the resolved immutable Artifact Registry digest (`whatsss@sha256:...`) and pins secrets to explicit verified numeric versions.

```bash
gcloud run deploy whatsss \
  --image="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss:TAG" \
  --platform="managed" \
  --region="asia-southeast1" \
  --project="cpe334-whatsss-pmandels" \
  --allow-unauthenticated \
  --service-account="whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com" \
  --add-cloudsql-instances="cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql" \
  --min-instances=0 \
  --max-instances=3 \
  --port=8080 \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,APP_COMMIT_SHA=COMMIT_SHA,CLIENT_URL=https://whatsss-sipqw4logq-as.a.run.app" \
  --set-secrets="DATABASE_URL=whatsss-database-url:latest,JWT_SECRET=whatsss-jwt-secret:latest" \
  --startup-probe="httpGet.path=/api/ready,httpGet.port=8080,initialDelaySeconds=2,periodSeconds=5,timeoutSeconds=4,failureThreshold=6" \
  --liveness-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,periodSeconds=15,timeoutSeconds=3,failureThreshold=3"
```

---

## 7. Verified Local Container Testing Runbook

The multi-stage `Dockerfile` has been locally built and thoroughly verified against both disconnected and connected database conditions:

### 7.1 Build Image Locally
```bash
# Execute from repository root
docker build -t whatsss:test .
```
*Result:* Built 3 stages (`client-builder`, `server-builder`, `runner`). Final production image size is ~179MB uncompressed.

### 7.2 Run Container with Disconnected Database (Proving Liveness vs Readiness)
```bash
docker run -d --name whatsss-test-instance \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e JWT_SECRET="test_only_cryptographically_secure_jwt_secret_32_chars" \
  -e CLIENT_URL="http://localhost:8080" \
  -e DATABASE_URL="postgresql://test:test@127.0.0.1:5432/test" \
  -p 8080:8080 \
  whatsss:test
```

**Verification Results:**
* `curl -i http://localhost:8080/api/health` $\rightarrow$ **HTTP 200 OK** (`{"status":"ok","timestamp":"...","commitSha":"development"}`)
* `curl -i http://localhost:8080/` $\rightarrow$ **HTTP 200 OK** (serves SPA `index.html` with bundled Vite JS & CSS assets)
* `curl -i http://localhost:8080/api/ready` $\rightarrow$ **HTTP 503 Service Unavailable** (`{"status":"not_ready","database":"disconnected","error":"Database connection unavailable",...}`)
* Container logs show masked error message (`Can't reach database server at 127.0.0.1:5432`) without secret leaks.

### 7.3 Run Container Connected to PostgreSQL (Live Migration, Seed & Readiness 200)
```bash
# 1. Ensure PostgreSQL is active via docker compose
docker compose up -d postgres

# 2. Extract database connection URL from .env (matching configured POSTGRES_PASSWORD)
# Format: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
source .env && DOCKER_DB_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-whatsss_db}?schema=public"

# 3. Run Prisma migration inside container against PostgreSQL
docker run --rm --network whatsss-pmandels_default \
  -e DATABASE_URL="${DOCKER_DB_URL}" \
  whatsss:test npx prisma migrate deploy
# Output: 3 migrations found. No pending migrations to apply. Database schema is up to date!

# 4. Run Prisma seed inside container
docker run --rm --network whatsss-pmandels_default \
  -e DATABASE_URL="${DOCKER_DB_URL}" \
  -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-AdminSecurePassword123!}" \
  -e SEED_DEMO_DATA="true" \
  -e SEED_DEMO_PASSWORD="${SEED_DEMO_PASSWORD:-DemoSecurePassword123!}" \
  whatsss:test npm run prisma:seed
# Output: Production admin preserved. user_demo preserved. Accounts upserted idempotently.

# 5. Start live container connected to PostgreSQL
docker run -d --name whatsss-live-instance --network whatsss-pmandels_default \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e JWT_SECRET="test_only_cryptographically_secure_jwt_secret_32_chars" \
  -e CLIENT_URL="http://localhost:8080" \
  -e DATABASE_URL="${DOCKER_DB_URL}" \
  -p 8080:8080 \
  whatsss:test

# 6. Verify live readiness probe
curl -i http://localhost:8080/api/ready
# Output: HTTP 200 OK {"status":"ready","database":"connected","timestamp":"...","commitSha":"development"}
```

### 7.4 Single-Command Local Full-Stack Deployment (`docker compose`)

`docker-compose.yml` orchestrates the complete stack locally in a single command, running PostgreSQL, applying schema migrations, running idempotent seed, and serving the full-stack container. Dynamic container naming is managed automatically by Compose without static `container_name` to prevent collisions across multiple workspaces or developer projects.

```bash
# 1. Initialize environment file from template
cp .env.example .env

# 2. Generate local-only test secrets
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -hex 16)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# 3. Write configured secrets to .env (ensuring matching database credentials)
# NOTE: POSTGRES_USER=postgres is for local development/testing only.
# In GCP Cloud SQL or production, configure dedicated application database users.
cat <<EOF > .env
# Server Network & Host Configuration
PORT=8080
HOST=0.0.0.0
CLIENT_URL=http://localhost:8080
NODE_ENV=production

# Local PostgreSQL Configuration (Local only; do not use in Cloud SQL)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=whatsss_db
POSTGRES_PORT=5432

# Database Connection String (Credentials synchronized with POSTGRES_USER & POSTGRES_PASSWORD)
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/whatsss_db?schema=public"

# Authentication & JWT Security
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
APP_COMMIT_SHA=development

# Initial Seed Configuration
SEED_ADMIN_PASSWORD=${ADMIN_PASSWORD}
SEED_ADMIN_EMAIL=admin@whatsss.local
SEED_DEMO_DATA=false
SEED_DEMO_PASSWORD=
SEED_DEMO_EMAIL=user_demo@whatsss.local
EOF

# Note on Demo User:
# SEED_DEMO_DATA is false by default. If you need a pre-seeded demo user (user_demo)
# for evaluation, set SEED_DEMO_DATA=true and assign a secure SEED_DEMO_PASSWORD (min 12 chars).

# 4. Verify Compose configuration and variable interpolation
docker compose config

# 5. Start PostgreSQL, apply migrations, seed admin account, and launch application
docker compose up -d --build

# 6. Verify all services are healthy and running
docker compose ps
# Expected output:
# NAME                       IMAGE           STATUS         PORTS
# <project>-app-1            whatsss:local   Up (healthy)   0.0.0.0:8080->8080/tcp
# <project>-migrate-1        whatsss:local   Exited (0)     (migrations & seed completed)
# <project>-postgres-1       postgres:16     Up (healthy)   0.0.0.0:5432->5432/tcp

# 7. View logs using compose service names
docker compose logs migrate
docker compose logs app

# 8. Probe application health (liveness) & readiness
curl -i http://localhost:8080/api/health
curl -i http://localhost:8080/api/ready
```

#### Required Configuration Reference Table

| Key | Purpose | Required Format / Value | Scope |
|---|---|---|---|
| `POSTGRES_USER` | Local DB username | `postgres` | Local / Sandbox only |
| `POSTGRES_PASSWORD` | Local DB password | Unique random string (e.g. 16+ hex chars) | Local / Sandbox only |
| `POSTGRES_DB` | Database schema name | `whatsss_db` | Local / Sandbox only |
| `DATABASE_URL` | Local DB connection URI | `postgresql://postgres:<matching-password>@localhost:5432/whatsss_db?schema=public` | Local host / runner |
| `JWT_SECRET` | Token signing secret | Unique cryptographically random key (min 32 chars) | All environments |
| `SEED_ADMIN_PASSWORD` | Initial admin password | Unique secure password (min 12 chars) | All environments |
| `SEED_DEMO_DATA` | Flag for demo account | `false` (default) or `true` | Testing only |
| `SEED_DEMO_PASSWORD` | Password for `user_demo` | Required only when `SEED_DEMO_DATA=true` (min 12 chars) | Testing only |

> [!WARNING]
> **PostgreSQL Password with Existing Docker Volumes:**
> If an existing PostgreSQL data volume (`whatsss_pgdata`) has already been initialized, changing `POSTGRES_PASSWORD` in `.env` alone will **not** alter the database password stored inside the volume. In that case, you must update the password directly in PostgreSQL (`ALTER USER postgres WITH PASSWORD '...';`) or retain the existing password in `.env`. Do **not** arbitrarily run `docker compose down -v` on persistent environments, as that will destroy stored business data.

---

## 8. Check C-03: Clean-Clone Build & Run Verification Report

**Requirement:** The project must build and run cleanly from a fresh `git clone` using only environment variables copied from `.env.example` (with zero committed secrets). Data must persist across container teardowns (`docker compose down` then `docker compose up -d`).

> [!IMPORTANT]
> **Template Clarification:** `.env.example` is an environment template containing configuration keys and safe placeholder strings (`replace_with_*`). It is intentionally **not** a runnable configuration as-is. In accordance with security controls (CWE-1188), the application strictly detects and rejects template placeholders upon startup and database seed execution. Operators and CI runners must generate real cryptographic secrets (`openssl rand -hex 32`) and set passwords before launching services.

### 8.1 Verification Procedure & Execution Log

#### Step 1: Fresh Git Clone & Environment Initialization
Executed inside a clean, isolated scratch directory:
```bash
git clone -b feat/docker-clean-clone-c03 <repository-url> clean-clone-dir
cd clean-clone-dir
cp .env.example .env
```
Populated valid local testing secrets in `.env` (substituting template placeholders):
* `POSTGRES_PASSWORD` (min 12 chars, generated local database password)
* `DATABASE_URL` (synchronized with `POSTGRES_PASSWORD`)
* `SEED_ADMIN_PASSWORD` (min 12 chars, e.g. generated secure password)
* `SEED_DEMO_DATA="true"` (explicitly enabled for test evaluation)
* `SEED_DEMO_PASSWORD` (min 12 chars, e.g. generated secure password)
* `JWT_SECRET` (min 32 chars, generated via `openssl rand -hex 32`)

> [!WARNING]
> **PostgreSQL Password with Existing Docker Volumes:**
> If an existing PostgreSQL data volume (`whatsss_pgdata`) has already been initialized, changing `POSTGRES_PASSWORD` in `.env` alone will **not** alter the database password stored inside the volume. In that case, you must update the password directly in PostgreSQL (`ALTER USER postgres WITH PASSWORD '...';`) or retain the existing password in `.env`. Do **not** arbitrarily run `docker compose down -v` on persistent environments, as that will destroy stored business data.

#### Step 2: Build & Start Full-Stack Services
```bash
docker compose up -d --build
```
**Sanitized Execution Output:**
```text
✔ Network clean-clone-dir_default              Created
✔ Volume clean-clone-dir_whatsss_pgdata        Created
✔ Container clean-clone-dir-postgres-1         Started (healthy)
✔ Container clean-clone-dir-migrate-1          Started (healthy -> Exited 0)
✔ Container clean-clone-dir-app-1              Started (healthy)
```

**Migration & Seed Log (`docker compose logs migrate`):**
```text
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "whatsss_db", schema "public" at "postgres:5432"

3 migrations found in prisma/migrations
Applying migration `20261107000000_init_users`
Applying migration `20261107120000_create_accounts_table`
Applying migration `20261107150000_create_transactions_and_allocations`
All migrations have been successfully applied.

> whatsss-server@0.1.0 prisma:seed
> tsx prisma/seed.ts

Production initial administrator account provisioned securely.
Production demo user (user_demo) provisioned securely.
```

#### Step 3: Health & Readiness Probe Verification
```bash
curl -i http://localhost:8080/api/health
# HTTP/1.1 200 OK
# {"status":"ok","timestamp":"2026-11-13T04:42:12.399Z","commitSha":"development"}

curl -i http://localhost:8080/api/ready
# HTTP/1.1 200 OK
# {"status":"ready","database":"connected","timestamp":"2026-11-13T04:42:12.558Z","commitSha":"development"}
```

#### Step 4: End-to-End Authentication & Record Creation (Local Clean-Clone Walkthrough Fixture Example)
> [!NOTE]
> The account UUIDs (`ba318feb-9564-4464-b656-8d4cc7a63cd1`, `2f2d3c8d-916b-4601-9739-4c4b64bd5913`) and transaction ID (`8ae70038-8827-40df-b8d1-c88f23913bee`) below are **sample output fixtures** captured from the local Clean-Clone walkthrough run on `2026-11-13`. In automated CI runs (Section 8.2 & Section 10.1), account UUIDs are dynamically resolved on every run via `jq`.

1. **User Authentication (`POST /api/auth/login`):**
   ```bash
   curl -i -c cookie.txt -X POST http://localhost:8080/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:8080" \
     -d '{"username":"user_demo","password":"DemoSecurePassword123!"}'
   # HTTP/1.1 200 OK
   # Set-Cookie: token=...; HttpOnly; Secure; SameSite=Lax
   # {"success":true,"data":{"user":{"id":"749831da-2f6f-4c1a-897d-1e20a394e65b","username":"user_demo","role":"USER"}}}
   ```

2. **Retrieve Baseline Accounts (`GET /api/accounts`):**
   Returned 5 provisioned accounts (`Checking Bank` CASH ID `ba318feb-9564-4464-b656-8d4cc7a63cd1`, `Salary` INCOME ID `2f2d3c8d-916b-4601-9739-4c4b64bd5913`).

3. **Record Test Income Transaction (`POST /api/transactions/income`):**
   ```bash
   curl -i -b cookie.txt -X POST http://localhost:8080/api/transactions/income \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:8080" \
     -d '{
       "primary_account_id":"ba318feb-9564-4464-b656-8d4cc7a63cd1",
       "income_account_id":"2f2d3c8d-916b-4601-9739-4c4b64bd5913",
       "total_amount":"15000.00",
       "transaction_date":"2026-11-13",
       "description":"C-03 Clean Clone Initial Salary Deposit"
     }'
   # HTTP/1.1 201 Created
   # {"success":true,"data":{"transaction":{"id":"8ae70038-8827-40df-b8d1-c88f23913bee",...},"updated_balance":{"current_balance":"15000.00"}}}
   ```

#### Step 5: Container Teardown & Re-launch (Persistence Proof)
1. **Tear Down Running Containers (preserving named volume):**
   ```bash
   docker compose down
   # Output:
   # Container clean-clone-dir-app-1 Stopped & Removed
   # Container clean-clone-dir-migrate-1 Stopped & Removed
   # Container clean-clone-dir-postgres-1 Stopped & Removed
   # Network removed (Volume whatsss_pgdata preserved)
   ```

2. **Re-launch Containers:**
   ```bash
   docker compose up -d
   # Output:
   # Container clean-clone-dir-postgres-1 Started (healthy)
   # Container clean-clone-dir-migrate-1 Started -> Idempotent seed preserved -> Exited 0
   # Container clean-clone-dir-app-1 Started (healthy)
   ```

3. **Verify Data Persistence:**
   ```bash
   curl -i -b cookie.txt http://localhost:8080/api/transactions
   # HTTP/1.1 200 OK
   # Record found:
   # {
   #   "id": "8ae70038-8827-40df-b8d1-c88f23913bee",
   #   "description": "C-03 Clean Clone Initial Salary Deposit",
   #   "total_amount": 15000,
   #   "transaction_date": "2026-11-13"
   # }

   curl -i -b cookie.txt http://localhost:8080/api/accounts
   # HTTP/1.1 200 OK
   # Checking Bank balance preserved: 15000.00 THB, is_opening_locked: true
   ```

**Conclusion:** Check **C-03** is fully satisfied. The application builds, seeds, and executes cleanly from a fresh clone with `.env.example` placeholders, and data persists across container lifecycles in the PostgreSQL volume.

### 8.2 Automated Clean-Clone CI Pipeline Verification (`.github/workflows/ci-docker.yml` & `ci.yml`)

To provide continuously verifiable, traceable proof that the application adheres to Check **C-03** on every Pull Request and branch push, both `.github/workflows/ci-docker.yml` (`test-and-docker` on PRs) and `.github/workflows/ci.yml` (`c03-clean-clone-verification` on pushes) execute the automated end-to-end C-03 verification:

1. **Authentic Clean Git Clone:** Clones the repository afresh from the current workspace into an isolated runner directory (`../clean-clone-test`) and checks out the exact PR/branch commit SHA (`git checkout "${{ github.sha }}"`), ensuring no untracked files or cached build artifacts leak into the test.
2. **Template Secret Interpolation & Special-Character Password Encoding:** Copies `.env.example` to `.env`, generates dynamic ephemeral random credentials (`openssl rand -hex 32` for `JWT_SECRET`, unique passwords for `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD`), and tests `POSTGRES_PASSWORD` containing URI-reserved special characters (`@`, `#`, `/`, `:`) paired with a URL-encoded `DOCKER_DATABASE_URL`. Validates syntax via `docker compose config -q` and masks all generated secrets in CI logs (`::add-mask::`).
3. **Migration Failure Gate Verification (`service_completed_successfully`):** Simulates a migration failure using an unreachable database target in an isolated compose project (`-p whatsss_mig_fail_ci`) and verifies that `docker compose up -d app` exits non-zero and the `app` container never starts when `migrate` fails.
4. **Single-Command Stack Startup:** Executes `docker compose -p whatsss_c03_ci up -d --build`. Polling logic enforces a strict timeout: if the app container fails to report `healthy` within 30 cycles (60s), CI dumps container logs and immediately exits with failure (`exit 1`).
5. **Health (Liveness) Verification:** Confirms `GET /api/health` returns HTTP 200 OK with `{"status":"ok"}`.
6. **Readiness Probe State Discrimination (DB Healthy vs Outage vs Recovery):**
   - Asserts `GET /api/ready` returns **HTTP 200 OK** (`database: connected`).
   - Simulates database outage by stopping the PostgreSQL container (`docker compose -p whatsss_c03_ci stop postgres`).
   - Asserts `GET /api/ready` returns **HTTP 503 Service Unavailable** (`database: disconnected`).
   - Asserts `GET /api/health` still returns **HTTP 200 OK**, confirming process liveness is not tied to database availability.
   - Restarts PostgreSQL (`docker compose -p whatsss_c03_ci start postgres`), actively verifies that PostgreSQL recovers to `healthy` within 20 cycles (or exits immediately with `exit 1` and container logs), and confirms `GET /api/ready` recovers to **HTTP 200 OK**.
   - A shell `trap` guarantees that PostgreSQL is revived even if any intermediate assertion fails.
7. **Robust End-to-End API Transaction Processing:**
   - Authenticates as `user_demo` via `POST /api/auth/login` and captures the session cookie.
   - Queries `GET /api/accounts` and uses `jq` to parse the exact UUIDs for `Checking Bank` and `Salary`.
   - Records an income transaction of 25,000.00 THB (`POST /api/transactions/income`), receiving HTTP 201 Created.
8. **Volume Persistence Verification Across Teardown:**
   - Executes `docker compose -p whatsss_c03_ci down` (retaining volume `whatsss_c03_ci_whatsss_pgdata`).
   - Re-launches the stack via `docker compose -p whatsss_c03_ci up -d`, with health timeout validation.
   - Re-authenticates and calls `GET /api/transactions` to confirm that the recorded transaction and updated balance persisted intact across container destruction.
9. **Scoped Project Cleanup:** Teardown is scoped strictly to project `-p whatsss_c03_ci` (`docker compose -p whatsss_c03_ci down -v`), ensuring that test volume removal is strictly isolated to CI and never impacts developer or production data.

### 8.3 Check C-04: Public Cloud Run Deployment & End-to-End Verification Report (Episode 5 / Issue #19)

**Requirement (Check C-04):** The application must be live on a public Google Cloud Run HTTPS URL (`https://whatsss-sipqw4logq-as.a.run.app`), connected to Cloud SQL PostgreSQL 16 (`whatsss-sql`) via Unix socket with Secret Manager secrets and a least-privilege runtime service account (`whatsss-runner`), and pass full end-to-end UI $\rightarrow$ API $\rightarrow$ DB workflow and domain rule rejection verification.

#### 1. Live Health & Readiness Probe Verification
Executed against the live public Cloud Run URL (`https://whatsss-sipqw4logq-as.a.run.app`):

```bash
curl -i https://whatsss-sipqw4logq-as.a.run.app/api/health
# HTTP/1.1 200 OK
# {"status":"ok","timestamp":"2026-11-13T17:39:56.168Z","commitSha":"2a7c4c7343e6426cfca713d3288d495dfed5f92d"}

curl -i https://whatsss-sipqw4logq-as.a.run.app/api/ready
# HTTP/1.1 200 OK
# {"status":"ready","database":"connected","timestamp":"2026-11-13T17:39:56.361Z","commitSha":"2a7c4c7343e6426cfca713d3288d495dfed5f92d"}
```

#### 2. End-to-End Domain Workflow Verification (UI $\rightarrow$ API $\rightarrow$ Cloud SQL `whatsss-sql`)
Executed on `https://whatsss-sipqw4logq-as.a.run.app` as the seeded evaluator account (`user_demo`, role `USER`):

| Step | Action Executed in Live React SPA | API Endpoint & Persistence Effect | Verified UI & Database State |
|:---:|---|---|---|
| **1** | Sign in at `/login` as `user_demo` | `POST /api/auth/login` (`200 OK`, sets `HttpOnly; Secure; SameSite=Lax` cookie) | Redirected to `/dashboard`; initial balances `0.00 THB`; 5 seeded baseline accounts present (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`) |
| **2** | Set Opening Balance on `Checking Bank` (`CASH`) to `10,000.00 THB` | `PATCH /api/accounts/:id/opening-balance` (`200 OK`) | `Checking Bank` displays `Current Balance: ฿10,000.00`, `Opening: ฿10,000.00` |
| **3** | Record Income: `Checking Bank` $\leftarrow$ `Salary` for `20,000.00 THB` (`2026-11-13`, `C-04 Cloud Run Salary`) | `POST /api/transactions/income` (`201 Created`) | `Checking Bank` balance updates to `฿30,000.00`; status transitions to **`Opening balance locked`** (`BR-02`) |
| **4** | Record Split Expense on `Visa Credit Card` (`LOAN_TAKEN`) for `3,000.00 THB` (`2026-11-13`), allocated across `Dining: 1,000.00 THB` and `Grocery: 2,000.00 THB` | `POST /api/transactions/expense` (`201 Created`) | `Visa Credit Card` debt updates to `฿3,000.00`; opening balances locked on `Visa Credit Card`, `Dining`, and `Grocery` |
| **5** | Record Credit Card Repayment: `Checking Bank` $\rightarrow$ `Visa Credit Card` for `3,000.00 THB` (`2026-11-13`, `C-04 Cloud Run Full Repayment`) | `POST /api/transactions/repayment` (`201 Created`) | `Checking Bank` balance updates to **`฿27,000.00`**; `Visa Credit Card` debt settled to **`฿0.00`** |
| **6** | Inspect `/dashboard` and `/transactions` (Transaction History) | `GET /api/dashboard`, `GET /api/transactions` (`200 OK`) | **Dashboard:** `Checking Bank Balance: 27,000.00 THB`, `Credit Card Debt: 0.00 THB`, `Total Income: 20,000.00 THB`, `Total Expenses: 3,000.00 THB`, Breakdown `Dining 1,000.00 THB (33%)` & `Grocery 2,000.00 THB (67%)`.<br/>**History:** All 3 transactions and 2-line split allocations (`Grocery: 2,000.00 THB`, `Dining: 1,000.00 THB`) rendered from Cloud SQL |

#### 3. Domain Rule Rejection Verification on Live Cloud Run URL
1. **Rule Rejection #1 — Unbalanced Split Expense Allocation Blocked (`BR-04`):**
   - In the Record Purchase modal (`Visa Credit Card`), entered `Total Purchase = 3,000.00 THB` with `Dining = 1,000.00 THB` and `Grocery = 1,500.00 THB` (`Allocated: ฿2,500.00`, `Remaining: ฿500.00`).
   - **Verified Rejection:** The Allocation Summary flagged `Incomplete · Total Purchase ฿3000.00 · Allocated ฿2500.00 · Remaining ฿500.00` with warning `⚠ Allocate the remaining ฿500.00 to continue.`, and kept the `Record Purchase` submit button strictly `disabled` (backed by server-side `422 ALLOCATION_SUM_MISMATCH`).
2. **Rule Rejection #2 — Administrator Financial Ledger Segregation (`BR-10`):**
   - Logged out of `user_demo` and signed in at `/login` as `admin` (role `ADMIN`).
   - **Verified Rejection:** Immediately redirected to `https://whatsss-sipqw4logq-as.a.run.app/access-denied` displaying **`Access Forbidden (403)`** (`Your account (admin) has the ADMIN role. Security Policy (BR-10): Administrative accounts are strictly segregated from financial ledger access to protect tenant financial privacy and maintain zero-trust boundaries.`). Direct navigation attempts to `/dashboard` and `/accounts` as `admin` are likewise blocked and redirected to `/access-denied`.

#### 4. Visual Verification Artifacts & Screenshot Evidence (Check C-04)

The deployment and end-to-end user workflows have been verified with complete photographic evidence stored in [`docs/labs/lab-05/evidence/`](evidence/) captured from Cloud Shell and live browser sessions:

| Artifact ID | Artifact Description & Scope | Visual Evidence File | Verified Operational State |
|:---:|---|---|---|
| **EVD-01** | **Live Cloud Run Landing Page** | [`evidence/c04-01-public-cloud-run-landing.png`](evidence/c04-01-public-cloud-run-landing.png) | Public HTTPS entry point (`https://whatsss-sipqw4logq-as.a.run.app/login`) serving SPA bundle over Google Front End proxy |
| **EVD-02** | **Evaluator Sign-in (`user_demo`)** | [`evidence/c04-02-user-login.png`](evidence/c04-02-user-login.png) | Successful login as `user_demo` via `POST /api/auth/login` receiving `HttpOnly; Secure; SameSite=Lax` session cookie |
| **EVD-03** | **Transaction Creation & Ledger Recording** | [`evidence/c04-03-transaction-creation-recorded.png`](evidence/c04-03-transaction-creation-recorded.png) | Recorded Salary deposit (`20,000.00 THB`), split expense (`3,000.00 THB`), and credit card repayment (`3,000.00 THB`) into Cloud SQL |
| **EVD-04** | **BR-04 Split Sum Mismatch Rejection** | [`evidence/c04-04-br04-unbalanced-split-rejection.png`](evidence/c04-04-br04-unbalanced-split-rejection.png) | Warning `⚠ Allocate the remaining ฿500.00 to continue.` with `Record Purchase` submit button strictly disabled |
| **EVD-05** | **BR-10 Admin Ledger Access Denied (403)** | [`evidence/c04-05-br10-admin-access-denied-403.png`](evidence/c04-05-br10-admin-access-denied-403.png) | `admin` user redirected to `/access-denied` with **Access Forbidden (403)** banner protecting tenant financial ledger privacy |
| **EVD-06** | **Cloud Run Health & Ready Probes** | [`evidence/c04-06-api-health-ready-probes.png`](evidence/c04-06-api-health-ready-probes.png) | `/api/health` 200 OK and `/api/ready` 200 OK (`"database":"connected"`) on public Cloud Run service URL |
| **EVD-07** | **Cloud SQL Instance Configuration** | [`evidence/c04-07-cloud-sql-configuration.png`](evidence/c04-07-cloud-sql-configuration.png) | Cloud SQL instance `whatsss-sql` (`POSTGRES_16`, `db-f1-micro`, `--no-storage-auto-increase`) in `asia-southeast1` |
| **EVD-08** | **Runtime Service Account & IAM Roles** | [`evidence/c04-08-runtime-sa-and-iam.png`](evidence/c04-08-runtime-sa-and-iam.png) | Dedicated least-privilege service account `whatsss-runner` with `roles/cloudsql.client` and secret-level `roles/secretmanager.secretAccessor` |
| **EVD-09** | **Evaluator Final Financial Dashboard** | [`evidence/c04-09-user-demo-dashboard-final.png`](evidence/c04-09-user-demo-dashboard-final.png) | Final ledger state: **Checking Bank: ฿27,000.00**, **Credit Card Debt: ฿0.00**, Total Income: ฿20,000.00, Total Expenses: ฿3,000.00 |
| **EVD-10** | **Cloud Shell SA Project IAM Policy** | [`evidence/c04-10-cloudshell-iam-cloudsql-client.jpg`](evidence/c04-10-cloudshell-iam-cloudsql-client.jpg) | `gcloud projects get-iam-policy` output confirming runtime SA holds strictly `ROLE: roles/cloudsql.client` (zero Owner/Editor roles) |
| **EVD-11** | **Cloud Shell Secret Accessor & Container Spec** | [`evidence/c04-11-cloudshell-secretmanager-and-spec.png`](evidence/c04-11-cloudshell-secretmanager-and-spec.png) | `gcloud secrets get-iam-policy` confirming `roles/secretmanager.secretAccessor` + Cloud Run spec with `NODE_ENV=production` & `CLIENT_URL` |
| **EVD-12** | **Credential Mismatch Caught by Startup Probe** | [`evidence/c04-12-rotation-probe-failure-credential-mismatch.png`](evidence/c04-12-rotation-probe-failure-credential-mismatch.png) | Cloud Run startup probe check failing on credential mismatch, preventing traffic routing to unauthenticated revision |
| **EVD-13** | **Cloud Logging Prisma Initialization Error** | [`evidence/c04-13-cloud-logging-prisma-auth-failed.png`](evidence/c04-13-cloud-logging-prisma-auth-failed.png) | Cloud Logging trace proving Prisma authentication failure against Cloud SQL Unix socket proxy when credentials mismatch |
| **EVD-14** | **Revision 00006 Deployed & Probes Verified** | [`evidence/c04-14-cloudshell-successful-revision-00006-probes.png`](evidence/c04-14-cloudshell-successful-revision-00006-probes.png) | Revision `whatsss-00006-9j1` serving 100% traffic with HTTP/2 200 OK on both `/api/health` and `/api/ready` (`database: connected`) |

##### Visual Evidence Gallery

**Figure 8.1 — Public Cloud Run Landing & Sign-in**
![C-04 Public Cloud Run Landing Page](evidence/c04-01-public-cloud-run-landing.png)

**Figure 8.2 — Evaluator Authentication (`user_demo`)**
![C-04 Evaluator Sign-in](evidence/c04-02-user-login.png)

**Figure 8.3 — Transaction Creation & Ledger Persistence**
![C-04 Transaction Creation](evidence/c04-03-transaction-creation-recorded.png)

**Figure 8.4 — BR-04 Domain Rule Rejection (Unbalanced Split Expense Blocked)**
![C-04 BR-04 Unbalanced Split Rejection](evidence/c04-04-br04-unbalanced-split-rejection.png)

**Figure 8.5 — BR-10 Security Rule Rejection (Administrator Ledger Segregation 403 Forbidden)**
![C-04 BR-10 Admin Access Denied](evidence/c04-05-br10-admin-access-denied-403.png)

**Figure 8.6 — Live Cloud Run Service Health and Readiness Probes**
![C-04 API Health and Ready Probes](evidence/c04-06-api-health-ready-probes.png)

**Figure 8.7 — Cloud SQL Instance Configuration (`whatsss-sql`)**
![C-04 Cloud SQL Configuration](evidence/c04-07-cloud-sql-configuration.png)

**Figure 8.8 — Least-Privilege Runtime Service Account (`whatsss-runner`)**
![C-04 Runtime SA and IAM](evidence/c04-08-runtime-sa-and-iam.png)

**Figure 8.9 — Evaluator Dashboard Final Balanced Ledger (`27,000.00 THB`)**
![C-04 Evaluator Dashboard Final](evidence/c04-09-user-demo-dashboard-final.png)

**Figure 8.10 — Cloud Shell Project IAM Policy Verification (`roles/cloudsql.client`)**
![C-04 Cloud Shell Project IAM](evidence/c04-10-cloudshell-iam-cloudsql-client.jpg)

**Figure 8.11 — Cloud Shell Secret Manager Binding & Cloud Run Container Spec**
![C-04 Cloud Shell Secret Accessor and Spec](evidence/c04-11-cloudshell-secretmanager-and-spec.png)

**Figure 8.12 — Rotation Safety: Startup Probe Failure on Mismatched Secret Version**
![C-04 Rotation Startup Probe Failure](evidence/c04-12-rotation-probe-failure-credential-mismatch.png)

**Figure 8.13 — Cloud Logging: Prisma Authentication Error on Mismatched Credentials**
![C-04 Cloud Logging Prisma Auth Failure](evidence/c04-13-cloud-logging-prisma-auth-failed.png)

**Figure 8.14 — Operational Verification: Revision 00006 Serving 100% Traffic with 200 Probes**
![C-04 Revision 00006 Healthy Probes](evidence/c04-14-cloudshell-successful-revision-00006-probes.png)

---

## 9. Rollback & Disaster Recovery Runbook

### 9.1 Cloud Run Instant Revision Rollback
If a newly deployed revision encounters unexpected errors or failed health probes:

```bash
# 1. List available Cloud Run revisions
gcloud run revisions list --service=whatsss --region=asia-southeast1

# 2. Route 100% of user traffic immediately back to previous healthy revision
gcloud run services update-traffic whatsss \
  --region=asia-southeast1 \
  --to-revisions=PREVIOUS_HEALTHY_REVISION_NAME=100
```
This takes effect in $< 2$ seconds at the Google Front End proxy level without rebuilding or redeploying images.

### 9.2 Database Schema Forward-Compatibility
To support zero-downtime rollbacks, schema migrations follow expand-and-contract patterns:
* Columns are added as nullable or with defaults.
* Column removals or renames occur in phased releases (Phase 1: add new column and sync; Phase 2: switch reads; Phase 3: drop old column).
* Avoid destructive schema migrations that break previous application revisions.

---

## 10. CI/CD Pipeline Automation (`.github/workflows/ci-docker.yml` & `ci.yml`)

The repository CI workflow enforces rigorous quality gates on every push and pull request targeting `staging-lab5` and `main`:

```mermaid
flowchart TD
    PR["Pull Request to staging-lab5 / main"] --> CIDocker["ci-docker.yml (Check C-01 & C-03)"]
    
    subgraph TestAndDockerJob ["Job: test-and-docker"]
        Checkout["Checkout & Gitleaks Scan"] --> BackendSteps["Backend: migrate + seed + test + build"]
        BackendSteps --> FrontendSteps["Frontend: test + build"]
        FrontendSteps --> DockerSteps["Docker: multi-stage build + probe"]
        DockerSteps --> C03Steps["C-03 Clean Clone + Migration Gate + Persistence"]
    end
    
    CIDocker --> TestAndDockerJob
    
    PushBranch["Push to staging-lab5 / main"] --> CIPush["ci.yml (Matrix & C-03 Clean Clone)"]
```

* **PR Status Check:** The workflow defines a unified job named `test-and-docker` in `.github/workflows/ci-docker.yml` (triggered on `pull_request` targeting `[main, staging-lab5]`, `workflow_call`, and `workflow_dispatch`). Configure this job as a required status check in GitHub branch protection rules for `staging-lab5` and `main`.
* **Concurrency & Evidence Preservation (`cancel-in-progress: false`):** Concurrency is grouped by `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: false` to prevent a newer run from cancelling an already-running workflow in the same concurrency group. GitHub concurrency groups allow only one pending run per group, so this setting does not guarantee that every commit receives an individual workflow run. Workflow run history must not be manually deleted or rewritten, in accordance with R-10.
* **No Bypass:** Neither `continue-on-error` nor bypass mechanisms are permitted in the workflow jobs.
* **Supply-Chain Security:** All third-party GitHub Actions are pinned to full, immutable 40-character commit SHAs (`actions/checkout`, `actions/setup-node`, `docker/setup-buildx-action`, `gitleaks/gitleaks-action`) with version comments to prevent supply-chain attacks.
* **Secret Detection & Prevention:** Gitleaks scans the full Git history and working tree using `.gitleaks.toml` with targeted allowlists for unit test fixtures and documentation template placeholders, and CI inspects the built Docker image layers and `/app` filesystem to confirm zero `.env` or credential files are packaged.

### 10.1 Release Verification Evidence Summary (P1-06 & Check C-04)

| Item | Verified Evidence |
|---|---|
| **Feature PR (C-01)** | [PR #26 (`feat/ci-docker-c01 -> staging-lab5`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/26) — Approved by `@Pilaiwan3492` ([Review `5891356921`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/26#pullrequestreview-5891356921) on `52d19ba`) and merged into `staging-lab5` in commit `b113cdf` (CI Run #3 [`43401398693`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43401398693)) |
| **Release PR** | [PR #27 (`staging-lab5 -> main`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/27) — Reviewed, approved, and merged by `@Pilaiwan3492` into `main` in commit `015d9c0` |
| **Verified PR Head SHA** | PR #28 Working Branch Head: Verified commit `03fa76300c11f6a0192f908d76ee201e055f0eca` (CI Run `43509812119`), followed by manual rotation runbook hardening commit `d104f9c`; `main` release `e86ee2a` / `015d9c0` |
| **Deployed Cloud Run Commit SHA** | **`2a7c4c7343e6426cfca713d3288d495dfed5f92d`** (Active deployed image `whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781` in revision `whatsss-00006-9j1` on Google Cloud Run serving 100% traffic) |
| **CI Run (PR `ci-docker.yml`)** | [PR #28 CI Run (`43500933925`, Job `test-and-docker`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43500933925) & [Previous PR #28 Run (`43495620797`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43495620797) & [Release PR #27 Run #10 (`43459279046`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459279046) — **PASSED** |
| **CI Run (Push `ci.yml`)** | [Run `43459265389` (`Backend`, `Frontend`, `Docker`, `Secret Scan`, `Check C-03`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459265389) — **PASSED** |
| **Backend Test** | **PASSED** — 9 unit test suites (145 tests including `P1-07` 6-case URL encoding) + 12 integration & E2E suites (including live PostgreSQL special-char password Prisma connection test in `db-password.test.ts` on Node.js 24 LTS) |
| **Frontend Test** | **PASSED** — 7 test suites (55 tests) + Vite production bundle build (`npm test` & `npm run build` on Node.js 24 LTS) |
| **Docker Build** | **PASSED** — Multi-stage `node:24-alpine` production image built, layer/filesystem secret inspection clean, `/api/health` (200), `/api/ready` (200), and `/` SPA verified |
| **C-03 Clean Clone** | **PASSED** — Verified in both `test-and-docker` ([Job `132089524739`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43484582047/job/132089524739)) and `c03-clean-clone-verification` ([Job `132001966691`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459265389/job/132001966691)): clean clone, special-char DB password, `docker compose config -q`, migration failure gate, 200/503/200 probes, 25,000 THB transaction, and volume persistence across restart |
| **Cloud Deploy (C-04)** | **VERIFIED** — Live deployment verified on Google Cloud Run at `https://whatsss-sipqw4logq-as.a.run.app` (`https://whatsss-1086708130644.asia-southeast1.run.app`), Revision `whatsss-00006-9jl` (pinned secrets: `whatsss-database-url:1`, `whatsss-jwt-secret:1`, `whatsss-admin-password:1`, `whatsss-demo-password:1`), Image digest `asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781`, connected to Cloud SQL `whatsss-sql` (`POSTGRES_16`, `db-f1-micro`, `--no-storage-auto-increase`); least-privilege IAM (`roles/cloudsql.client` only at project level + per-secret `roles/secretmanager.secretAccessor`), `/api/health` (200), `/api/ready` (200, `"database":"connected"`), E2E workflow (`27,000.00 THB` Bank / `0.00 THB` Debt), rule rejections (`BR-04` & `BR-10`), and hardened `deploy/deploy.sh` & `deploy/release.sh` verified via CI |

---

## Deployment Script Verification

- **URL encoding test:** Verified in `deploy/tests/test-deploy.sh` (Test 3), `server/tests/unit/config.test.ts` (`P1-07`), and live PostgreSQL Prisma integration test in `server/tests/integration/db-password.test.ts` across all 6 mandatory password cases (`NormalPass123` $\rightarrow$ `NormalPass123`, `Pass@123` $\rightarrow$ `Pass%40123`, `Pass#123` $\rightarrow$ `Pass%23123`, `Pass/123` $\rightarrow$ `Pass%2F123`, `Pass:123` $\rightarrow$ `Pass%3A123`, `Pass%123` $\rightarrow$ `Pass%25123`) and special-character usernames (`whatsss@app` $\rightarrow$ `whatsss%40app`) while preserving `postgresql://`, `?host=/cloudsql/...`, and `&schema=public` delimiters and leaking zero secret values in logs.
- **IAM failure handling & least-privilege verification:** Verified in `deploy/tests/test-deploy.sh` (Tests 7, 8, 9, 10, 11, 12) and confirmed on live GCP (`cpe334-whatsss-pmandels`) — `deploy.sh` fails closed immediately if reading project or secret IAM policy fails; fails fast (`exit 1`) when `gcloud projects add-iam-policy-binding` or `gcloud secrets add-iam-policy-binding` fails; and verifies post-provisioning IAM policy to ensure `whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com` holds ONLY `roles/cloudsql.client` at the project level (`ROLE: roles/cloudsql.client`) and per-secret `roles/secretmanager.secretAccessor` while rejecting `roles/owner`, `roles/editor`, `roles/storage.admin`, or project-wide `roles/secretmanager.secretAccessor`.
- **Secret rotation safety & fail-closed guard:** Verified in `deploy/tests/test-deploy.sh` (Tests 4, 5, 14) — initial deploy creates secret version `1`; subsequent deploy (`ROTATE_DB_PASSWORD=0`) preserves existing synchronized Cloud SQL password and Secret Manager version without unintended mutation; explicit rotation flag `ROTATE_DB_PASSWORD=1` fails closed immediately before modifying any GCP resource; manual maintenance rotation procedure with rollback restores previous credentials and service availability upon failure.
- **Migration failure test:** Verified in `deploy/tests/test-release.sh` (Tests 8, 9) — when `gcloud run jobs execute` returns non-zero or when the execution record reports `succeededCount < 1`, `release.sh` aborts immediately (`exit 1`) and never invokes `gcloud run deploy`.
- **Cloud Run URL synchronization:** Verified in `deploy/tests/test-release.sh` (Tests 6, 7, 10, 11, 12, 13) and confirmed on live Cloud Run (`gcloud run services describe whatsss` & `gcloud run jobs describe whatsss-migrate`) — first-time deploy uses safe `https://bootstrap-pending.invalid` before reading the real `status.url` (`https://whatsss-sipqw4logq-as.a.run.app`), rejects empty or non-`https://` URLs, updates `CLIENT_URL` to match `status.url`, and verifies both post-update `CLIENT_URL` and `serviceAccountName` (`whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com`) on the Job and Service.
- **DRY_RUN verification:** Verified in `deploy/tests/test-deploy.sh` (Test 2) and `deploy/tests/test-release.sh` (Test 5) — running `DRY_RUN=1` records zero invocations in the stateful mock command log (`0` mutations to Cloud SQL, Service Accounts, IAM, Secret Manager, Docker push, or Cloud Run) and leaks zero password/JWT/secret values in terminal output.
- **ShellCheck:** Enforced in `.github/workflows/ci-docker.yml` and `.github/workflows/ci.yml` (`shellcheck deploy/*.sh deploy/tests/*.sh deploy/tests/mocks/*`) alongside `bash -n` syntax validation.
- **Automated test run:** Executed automatically on every PR and push in GitHub Actions (`bash deploy/tests/test-deploy.sh` — 14/14 passed; `bash deploy/tests/test-release.sh` — 14/14 passed; Date: `2026-11-14`).

---

## 11. Issue #19 & Lab 5 Acceptance Criteria Checklist

### 11.1 Issue #19 (Episode 5 — First GCP Deployment & Check C-04) Acceptance Criteria

| Acceptance Criteria | Status | Evidence |
|---|---|---|
| **GCP APIs enabled** | **Verified** | GCP Console (`artifactregistry`, `run`, `sqladmin`, `secretmanager`, `iamcredentials`, `cloudbuild` enabled in project `cpe334-whatsss-pmandels`) |
| **Cloud SQL PostgreSQL 16** | **Verified** | Cloud SQL Instance `whatsss-sql` (`POSTGRES_16`, `Enterprise` edition, `db-f1-micro`, `10GB SSD`, database `whatsss_db`, dedicated user `whatsss_app`) |
| **Storage Auto-increase disabled** | **Verified** | SQL Configuration (`gcloud sql instances patch whatsss-sql --no-storage-auto-increase` enforced in `deploy/deploy.sh` and verified on `whatsss-sql`) |
| **Secret Manager** | **Verified** | Secret Metadata (`whatsss-database-url`, `whatsss-jwt-secret`, `whatsss-admin-password`, `whatsss-demo-password`; zero secret values committed to Git) |
| **Runtime SA Least Privilege** | **Verified** | IAM Policy (`gcloud projects get-iam-policy` confirmed `whatsss-runner@cpe334-whatsss-pmandels.iam.gserviceaccount.com` holds only `roles/cloudsql.client` at project level and `roles/secretmanager.secretAccessor` per secret; active on both `whatsss` service and `whatsss-migrate` job) |
| **Migration Job** | **Verified** | Job Execution (`whatsss-migrate` execution `whatsss-migrate-rmqkv` succeeded on Cloud Run with `whatsss-runner` SA; migration failure gate & execution status check verified in `deploy/tests/test-release.sh`) |
| **Cloud Run Service** | **Verified** | Service URL (`https://whatsss-sipqw4logq-as.a.run.app`, Revision `whatsss-00006-9jl` serving 100% traffic with pinned secret versions `1` and `whatsss-runner` SA) |
| **CLIENT_URL exact HTTPS** | **Verified** | Service Configuration (`gcloud run services describe whatsss` confirmed `CLIENT_URL: https://whatsss-sipqw4logq-as.a.run.app` matches `status.url: https://whatsss-sipqw4logq-as.a.run.app`) |
| **C-04 E2E** | **Verified** | Screenshots & Probe Logs (`/api/health` 200, `/api/ready` 200 `"database":"connected"`, `user_demo` E2E workflow `27,000.00 THB` Bank / `0.00 THB` Debt, `BR-04` unbalanced split rejection & `BR-10` Admin `403`) |
| **Deploy Script Tests** | **Verified** | Automated unit test suites (`deploy/tests/test-deploy.sh` 14/14 passed, `deploy/tests/test-release.sh` 14/14 passed, ShellCheck clean, and Prisma special-char DB URL integration tests passing in CI) |
| **PR Review** | **Merged** | [PR #28](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/28) (`chore/19-first-gcp-deploy-c04 -> staging-lab5`) reviewed, approved, and merged into `staging-lab5` at `2026-11-13T21:46:34Z` (merge commit `2b2f47403bb3192262842c9bc0e83f2b222223f9`) |

### 11.2 Cumulative Lab 5 Baseline Acceptance Criteria (Episodes 1–4)

| # | Acceptance Criterion | Status | Verification Evidence / Artifact |
|---|---|:---:|---|
| 1 | **CSRF Integration Tests** covering all mutating & safe HTTP methods across trusted, untrusted, and missing origins | **COMPLETED** | `server/tests/integration/health.test.ts` (20 integration tests) and `server/tests/integration/csrf.test.ts` verifying POST/PUT/PATCH/DELETE rejections (403), valid `CLIENT_URL` passage, and safe GET/HEAD/OPTIONS exemptions |
| 2 | **Multi-stage Dockerfile** building full-stack production image cleanly | **COMPLETED** | Root `Dockerfile` (`node:24-alpine`) with stages `client-builder` (`VITE_API_BASE_URL=/api`), `server-builder`, and `runner` (non-root `node:node`, ~179MB, accepting `APP_COMMIT_SHA`) |
| 3 | **Docker Image Artifact Integrity** containing frontend dist, backend dist, and Prisma migrations | **COMPLETED** | Verified inside container: `/app/client/dist` (HTML, JS, CSS), `/app/server/dist`, `/app/server/prisma` (`schema.prisma`, `migrations/`, `seed.ts`) |
| 4 | **Docker Container Startup & Liveness Probe** answering HTTP 200 | **COMPLETED** | Verified locally and in CI: `curl -i http://localhost:8080/api/health` returned HTTP 200 OK |
| 5 | **Single-Container SPA & Backend API Routing** via `/api` | **COMPLETED** | Verified locally and in CI: `/` returns full SPA HTML; API routes (`/api/auth/*`, `/api/*`) operate through Express pipeline |
| 6 | **Prisma Migration Execution** against real PostgreSQL database | **COMPLETED** | Verified inside container: `npx prisma migrate deploy` applied migrations to live PostgreSQL container; migration failure gate (`service_completed_successfully`) verified in CI |
| 7 | **Prisma Seed Idempotency, Atomicity & Data Safety** | **COMPLETED** | Verified in `server/prisma/seed.ts`, `server/tests/unit/seed.test.ts` (34 unit tests), and `server/tests/integration/db-account.test.ts` (live PostgreSQL rollback test): intentional Production 2-phase transaction boundary (`provisionAdmin` independent of atomic `user_demo` + 5 accounts `$transaction`), unified Dev/Test `$transaction`, strict role enforcement (`USER` vs `ADMIN`), and preserved credentials/transactions |
| 8 | **Cloud Run + Cloud SQL Connectivity Architecture** | **COMPLETED** | Provisioned and verified on GCP (`cpe334-whatsss-pmandels`, `asia-southeast1`): Unix Socket connection (`host=/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql`), least-privilege SA `whatsss-runner` (`roles/cloudsql.client`), and decoupled Cloud Run Job `whatsss-migrate` (`whatsss-migrate-rmqkv`) |
| 9 | **Secret Management Isolation** (Zero secrets in Image or Git) | **COMPLETED** | Enforced by `.dockerignore`, `.gitignore`, Gitleaks CI scan, `::add-mask::` in workflows, Docker image layer/filesystem inspection (`P2-12`), and GCP Secret Manager (`whatsss-database-url`, `whatsss-jwt-secret`, `whatsss-admin-password`, `whatsss-demo-password`) |
| 10 | **Readiness Probe State Discrimination & In-Flight Deduplication** | **COMPLETED** | Verified in `server/src/app.ts` & `server/tests/unit/health.test.ts` (11 unit tests) + `server/tests/integration/health.test.ts` (20 integration tests): 3s timeout, in-flight query deduplication (`activeReadyProbe` cleared only when DB query settles), and 200/503/200 state transition |
| 11 | **GitHub Actions CI Pipeline Automation** | **COMPLETED** | `.github/workflows/ci-docker.yml` and `.github/workflows/ci.yml` execute on Node.js 24 LTS across PRs and branch pushes with minimal `contents: read` permissions and full 40-char Action SHA pinning |
| 12 | **Check C-01: PR Automated Test & Docker Build (`test-and-docker`)** | **COMPLETED** | Verified on Feature PR #26 (approved by `@Pilaiwan3492` in Review `5891356921` and merged in `b113cdf`) and Release PR #27 (`staging-lab5 -> main`, CI Run #10 `43459279046` & Run #9 `43454153068`, merged in `015d9c0`) |
| 13 | **Deployment Guide Accuracy** matching tested commands and architecture | **COMPLETED** | `docs/labs/lab-05/deployment.md`, `deploy/deploy.sh`, and `deploy/release.sh` updated with exact verified GCP resource names, Node.js 24 LTS runtime, configuration runbooks, and diagrams |
| 14 | **Traceable Verification Evidence & Commit SHA** | **COMPLETED** | Feature PR #26 (`b113cdf`) and Release PR #27 (`015d9c0`) approved and merged by `@Pilaiwan3492`; Release PR #31 (`0cbd66d`), PR #32 (`ad20358`), PR #34 (`bcb87bb`), and PR #35 (`f160f25`) approved by `@Apichaya251400` and merged into `main` with full traceability |
| 15 | **Check C-03: Clean-Clone Build & Run Verification** | **COMPLETED** | Automated in both `ci-docker.yml` (PRs, Job `132001551007`) and `ci.yml` (pushes, Job `132001966691`): fresh clone, `.env.example` with special-char DB password & URL-encoded `DOCKER_DATABASE_URL`, migration failure gate, 200/503/200 probes, 25,000 THB transaction creation, and volume persistence across teardown |




---

## 12. Continuous Deployment Pipeline via GitHub Actions (Lab 5 Episode 7 / Issue #21 / Checkpoint C-06)

To satisfy Checkpoint C-06 (Continuous Deployment Pipeline and Automated Rollback), the repository provides `.github/workflows/deploy.yml` paired with `deploy/release.sh` and `deploy/smoke_test.py`.

```mermaid
flowchart TD
    Trigger["Trigger Event"] --> BranchCheck{"Triggered on refs/heads/main?"}
    BranchCheck -- "No" --> Denied["Deploy Blocked (main-only constraint)"]
    BranchCheck -- "Yes" --> ModeCheck{"Rollback Input (image_tag provided)?"}

    subgraph NormalFlow ["Normal Deployment Flow (Push to main / dispatch without tag)"]
        TestGate["Job: test-and-docker (Gate via ci-docker.yml)"]
        BuildImage["Build Docker Image (tagged with commit SHA)"]
        ResolveDigest1["Resolve Immutable Digest (@sha256:...) from Artifact Registry"]
        ValidateAllSecrets["Validate All 4 Secrets (DB, JWT, Admin Pwd, Demo Pwd)"]
        RunMigrateJob["Execute Cloud Run Job (whatsss-migrate) & Verify Success"]
        DeployService1["Deploy Cloud Run Service (whatsss)"]
    end

    subgraph RollbackFlow ["Rollback Flow (workflow_dispatch on main with 40-char SHA)"]
        SkipTest["Skip Test Job (Immediate Remediation)"]
        SkipBuild["Skip Docker Build (Image already exists)"]
        ResolveDigest2["Resolve Existing Digest (@sha256:...) from Artifact Registry"]
        ValidateServiceSecrets["Validate Service Secrets Only (DB_URL, JWT_SECRET)"]
        SkipMigration["SKIP_MIGRATIONS=true (Bypass Migration & Seed Job)"]
        DeployService2["Deploy Cloud Run Service (whatsss) with Target Digest"]
    end

    subgraph VerificationGate ["Post-Deployment Verification & Audit"]
        VerifyRevision["Verify Active Revision, Digest, Commit SHA & 100% Traffic"]
        SmokeTest["Execute Smoke Test (deploy/smoke_test.py) with SHA & HTTPS validation"]
        RecordSummary["Record Deployment Summary in GITHUB_STEP_SUMMARY"]
    end

    ModeCheck -- "No" --> TestGate
    TestGate -- "Passed" --> BuildImage
    BuildImage --> ResolveDigest1
    ResolveDigest1 --> ValidateAllSecrets
    ValidateAllSecrets --> RunMigrateJob
    RunMigrateJob --> DeployService1
    DeployService1 --> VerifyRevision

    ModeCheck -- "Yes" --> SkipTest
    SkipTest --> SkipBuild
    SkipBuild --> ResolveDigest2
    ResolveDigest2 --> ValidateServiceSecrets
    ValidateServiceSecrets --> SkipMigration
    SkipMigration --> DeployService2
    DeployService2 --> VerifyRevision

    VerifyRevision --> SmokeTest
    SmokeTest --> RecordSummary
```

### 12.1 Pipeline Trigger Modes & Security Gates
1. **Normal Automated Deployment (`push` to `main`):**
   - Automatically triggered upon merging code into `main`.
   - Gate 1: `test` job executes `.github/workflows/ci-docker.yml` (all unit, integration, clean-clone C-03, lint, and security checks must pass).
   - Gate 2: `deploy` job runs under the GitHub `demo` environment.
   - Gate 3: Docker image is built with `--build-arg APP_COMMIT_SHA=${GITHUB_SHA}` and tagged strictly with the 40-character Git commit SHA (mutable tags like `:latest` are removed).
   - Gate 4: The immutable image digest (`@sha256:...`) is resolved directly from Artifact Registry; Cloud Run deployments never reference mutable tags.
   - Gate 5: `deploy/release.sh` validates all 4 Secret Manager secret versions (`DB_URL_VERSION`, `JWT_SECRET_VERSION`, `ADMIN_PASSWORD_VERSION`, `DEMO_PASSWORD_VERSION`) to guarantee they exist and are in the `ENABLED` state.
   - Gate 6: `deploy/release.sh` runs the decoupled Cloud Run Migration Job (`whatsss-migrate`) synchronously. If migrations fail, the release aborts immediately without mutating or deploying the Cloud Run service.
   - Gate 7: `deploy/release.sh` deploys the Cloud Run Service (`whatsss`) with Cloud SQL connection, least-privilege runtime service account (`whatsss-runner`), and explicit numeric secret versions.
   - Gate 8: Cloud Run revision inspection verifies active revision, image digest, commit SHA, and confirms that 100% of user traffic is routed to the new revision.
   - Gate 9: `deploy/smoke_test.py` performs post-deployment probe verification on the live public HTTPS URL.

2. **Rollback Deployment (`workflow_dispatch` on `main` with `image_tag`):**
   - Operator triggers the workflow manually from `main` specifying the full 40-character commit SHA of an existing image in `image_tag`.
   - The `test` job is skipped to allow immediate remediation of production incidents.
   - Input validation strictly enforces `^[0-9a-f]{40}$` to prevent command injection.
   - Image build is skipped; existing image digest is resolved from Artifact Registry.
   - `SKIP_MIGRATIONS=true` is passed to `deploy/release.sh`, bypassing the Migration Job to prevent re-executing migrations or running potentially incompatible seed steps.
   - Required service secrets (`DB_URL_VERSION`, `JWT_SECRET_VERSION`) are strictly validated, but migration/seed-only secrets (`ADMIN_PASSWORD_VERSION`, `DEMO_PASSWORD_VERSION`) are not required during rollback.
   - Cloud Run revision, 100% traffic allocation, and smoke test verifications are executed normally.

### 12.2 GitHub `demo` Environment & Configuration Matrix
The `deploy` job targets the GitHub Environment `demo`, which enforces branch protection (`refs/heads/main` only) and provides the following configuration:

| Configuration Item | Type | Required for Normal | Required for Rollback | Description & Value |
|---|---|:---:|:---:|---|
| `GCP_PROJECT_ID` | Variable | Yes | Yes | GCP Project ID (`cpe334-whatsss-pmandels`) |
| `GCP_REGION` | Variable | Yes | Yes | Compute & Artifact Registry region (`asia-southeast1`) |
| `WIF_PROVIDER` | Variable | Yes | Yes | Workload Identity Federation provider resource identifier |
| `WIF_SERVICE_ACCOUNT` | Variable | Yes | Yes | Deployment service account (`whatsss-deployer@...`) |
| `DB_URL_VERSION` | Variable | Yes | Yes | Numeric Secret Manager version for PostgreSQL connection string (e.g. `1`) |
| `JWT_SECRET_VERSION` | Variable | Yes | Yes | Numeric Secret Manager version for JWT signing key (e.g. `1`) |
| `ADMIN_PASSWORD_VERSION` | Variable | Yes | No | Numeric version for seed administrator credentials (migration-only) |
| `DEMO_PASSWORD_VERSION` | Variable | Yes | No | Numeric version for seed demo user credentials (migration-only) |
| `SMOKE_EMAIL` | Variable | Optional | Optional | Dedicated user identifier for post-deploy smoke tests (e.g. `user_demo`) |
| `SMOKE_PASSWORD` | Secret | Optional* | Optional* | Password for dedicated smoke test user (*required if `SMOKE_EMAIL` is set) |

**Zero Long-Lived Service Account Keys:** Authentication uses Workload Identity Federation (OIDC token exchange via `google-github-actions/auth`). Permissions are strictly bounded:
- Top-level workflow permissions: `contents: read` only.
- `deploy` job permissions: `contents: read`, `id-token: write` (least-privilege OIDC access).

### 12.3 Explicit Secret Version Management
To eliminate nondeterministic runtime behavior caused by `:latest` references, all Secret Manager secrets are pinned to explicit numeric versions:
* `DATABASE_URL` -> `whatsss-database-url:${DB_URL_VERSION}`
* `JWT_SECRET` -> `whatsss-jwt-secret:${JWT_SECRET_VERSION}`
* `SEED_ADMIN_PASSWORD` -> `whatsss-admin-password:${ADMIN_PASSWORD_VERSION}` (Normal deploy only)
* `SEED_DEMO_PASSWORD` -> `whatsss-demo-password:${DEMO_PASSWORD_VERSION}` (Normal deploy only)

The release script verifies via `gcloud secrets versions describe` that each specified version exists and is in the `ENABLED` state before any rollout command is executed.

### 12.4 Post-Deployment Verification (Smoke Test & Revision Check)
The deployment workflow concludes with automated verification gates:
1. **Revision, Digest & Traffic Gate:**
   - Queries `gcloud run services describe whatsss` to obtain `status.latestReadyRevisionName`.
   - Inspects the revision container image and `APP_COMMIT_SHA` environment variable.
   - Verifies that 100% of traffic is allocated to the new revision (`status.traffic[0].percent == 100` and `status.traffic[0].revisionName == READY_REVISION`).
   - Fails immediately if the image digest, commit SHA, or traffic allocation does not match expectations.
2. **Automated Smoke Test (`deploy/smoke_test.py`):**
   - **Liveness Probe:** `GET /api/health` must return HTTP 200, `status: "ok"`, and matching `commitSha`.
   - **Readiness Probe:** `GET /api/ready` must return HTTP 200, `status: "ready"`, `database: "connected"`, and matching `commitSha`.
   - **Frontend UI:** `GET /` must return HTTP 200 with HTML document.
   - **Security Gate:** `GET /api/accounts` must return HTTP 401 Unauthorized without session cookies.
   - **Dedicated Smoke-Test User Flow:** When configured, tests login with `SMOKE_EMAIL` and `SMOKE_PASSWORD` using `{ "username": smoke_email, "password": smoke_password }` payload, calls protected `/api/auth/me`, verifies HTTP 200, calls `/api/auth/logout`, and confirms session invalidation (post-logout `/api/auth/me` returns 401).
   - **HTTPS Enforcement:** The automated smoke test strictly requires `https://` for all runs (both unauthenticated public probe checks and authenticated flows). Running over plain HTTP, FTP, or other insecure schemes fails fast before any network requests are made. In addition, URLs with invalid ports or embedded credentials are rejected before any network traffic is initiated.

### 12.5 Rollback Runbook & Limitations
To perform a rollback:
1. Go to **Actions** -> **Deploy demo** -> **Run workflow**.
2. Select branch `main`.
3. In `image_tag`, enter the full 40-character Git commit SHA of the known healthy revision (e.g., `2a7c4c7343e6426cfca713d3288d495dfed5f92d`).
4. Click **Run workflow**.

> [!WARNING] Database Migrations Are Forward-Only
> Rollbacks do **NOT** reverse database migrations (`SKIP_MIGRATIONS=true` prevents re-running migrations during rollback). All schema migrations must follow the expand-contract pattern and maintain backward compatibility with previous container images.

### 12.6 Smoke Test Failure Recovery Runbook
If the smoke test fails after a deployment:
1. The GitHub Actions job fails, alerting the team and recording details in the Step Summary.
2. **No Automatic Rollback:** The pipeline does **NOT** perform uncontrolled automated rollbacks or database mutations. Automated rollbacks upon probe failure can cause cascading failures (e.g., reverting to an older image incompatible with newly applied migrations, or entering infinite restart loops).
3. Review Cloud Run logs:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=whatsss" --limit=50 --project=cpe334-whatsss-pmandels
   ```
4. If the failure is due to an application bug, initiate a rollback using the procedure in §12.5 to restore the previous healthy revision.
5. If the failure is due to an external service outage (e.g., database connectivity), resolve the underlying infrastructure issue and re-run the workflow.


---

## 13. Data Persistence Across Revision Redeployment & Container Replacement (Checkpoint C-05)

### 13.1 Verification Objective & Architecture
Under Checkpoint C-05 and Requirement R-04, the production application must demonstrate zero data loss across container lifecycle events, including:
1. Container replacement and revision redeployment on Google Cloud Run.
2. Rollback dispatch operations and service updates.

**Architectural Foundation:** Google Cloud Run is a managed serverless container runtime. Cloud Run instances are strictly stateless and ephemeral: instances spin up on demand, shut down when idle, scale to zero, or get replaced whenever a new revision is deployed (`gcloud run deploy` / `deploy.yml`). There is no persistent disk attached to container instances. All persistent application state—including user credentials, financial account opening balances, double-entry transaction ledgers, split allocations, and audit history—is stored exclusively in Google Cloud SQL (`whatsss-sql` PostgreSQL 16 Enterprise) accessed via Cloud SQL Auth Proxy Unix sockets (`/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql`). Consequently, container termination, container replacement, or revision redeployment have zero impact on persistent database transactions.

### 13.2 Live Verification Procedure & Evidence

#### Step 1: Baseline Record Creation (Before Revision Redeployment)
* **Date & Environment:** `2026-11-14`, Production Google Cloud Run (`https://whatsss-sipqw4logq-as.a.run.app`).
* **Operator:** Signed in as seeded evaluator account `user_demo` (role `USER`).
* **Initial State:** Prior baseline balance of `27,000.00 THB` and total income of `20,000.00 THB` established during C-04 live testing.
* **Action:** Recorded a new income transaction:
  - Account: `Checking Bank`
  - Transaction Type: `Income`
  - Amount: `5,000.00 THB`
  - Description: `C-05 Persistence Test Deposit`
  - Date: `2026-11-14`
* **Result:** Transaction committed successfully to Cloud SQL. Live UI confirmed:
  - `Checking Bank Balance`: Updated from `27,000.00 THB` to **`32,000.00 THB`**
  - `Total Income`: Increased from `20,000.00 THB` to **`25,000.00 THB`**
  - `Credit Card Debt`: Remained fully settled at **`0.00 THB`**
  - Recent Transactions: Top record shows `2026-11-14 | Income | C-05 Persistence Test Deposit | + 5,000.00 THB`
* **Evidence Screenshot:** [`evidence/c05-01-before-restart.png`](evidence/c05-01-before-restart.png)

![Live Dashboard Before Revision Redeployment](evidence/c05-01-before-restart.png)
*Caption: Figure 13.1 — Production Dashboard before Revision Redeployment / Container Replacement (`https://whatsss-sipqw4logq-as.a.run.app/dashboard`). Evaluator user `user_demo` records income transaction "C-05 Persistence Test Deposit" (+5,000.00 THB), establishing a verified baseline balance of 32,000.00 THB.*

#### Step 2: Cloud Run Revision Redeployment & Container Replacement (Run ID `43599307331`)
* **Operation Performed:** Dispatched revision redeployment via GitHub Actions `workflow_dispatch` ([Run ID `43599307331`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43599307331)) specifying image tag `f160f256af24635cdc602b676a7cf8822fbbceb8`.
* **Execution Parameters & Workflow Mode:**
  - `inputs.image_tag`: `f160f256af24635cdc602b676a7cf8822fbbceb8`
  - `DEPLOY_IS_ROLLBACK`: `true`
  - `SKIP_MIGRATIONS`: `true`
* **Workflow Mechanics:**
  - The `test-and-docker` test gate and Docker build steps were skipped as designed for rapid redeployment.
  - Image digest was resolved directly from Artifact Registry (`asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss:f160f256af24635cdc602b676a7cf8822fbbceb8`).
  - Prisma migrations were bypassed (`SKIP_MIGRATIONS=true`).
  - Cloud Run deployed new active revision `whatsss-00020-65k`, routing 100% traffic to the new revision and replacing previously running container instances.
  - Automated HTTPS smoke tests (`deploy/smoke_test.py`) executed against public URL `https://whatsss-sipqw4logq-as.a.run.app`, passing `/api/health`, `/api/ready` (`database: connected`), `/` SPA HTML, and `/api/accounts` (401 auth gate).
* **Live Post-Redeployment Verification:**
  - Navigated to `https://whatsss-sipqw4logq-as.a.run.app/dashboard` and performed a forced hard refresh (`Ctrl+F5`) to verify state directly from Cloud SQL.
  - **Account Balance Verified:** `Checking Bank Balance` remained exactly **`32,000.00 THB`** (did not revert to opening balance of `10,000.00 THB` or baseline `27,000.00 THB`).
  - **Transaction Ledger Verified:** The exact test transaction `C-05 Persistence Test Deposit` (`+ 5,000.00 THB`, Date `2026-11-14`, Type `Income`) persisted intact at the top of the transaction history.
  - **Total Income & Debt Verified:** `Total Income` remained **`25,000.00 THB`**; `Credit Card Debt` remained **`0.00 THB`**.
* **Evidence Screenshot:** [`evidence/c05-02-after-restart.png`](evidence/c05-02-after-restart.png)

![Live Dashboard After Revision Redeployment](evidence/c05-02-after-restart.png)
*Caption: Figure 13.2 — Production Dashboard after Cloud Run Revision Redeployment / Container Replacement (`https://whatsss-sipqw4logq-as.a.run.app/dashboard`, Run ID `43599307331`, Revision `whatsss-00020-65k`). Full page hard refresh confirms zero data loss: Checking Bank balance remains 32,000.00 THB, Total Income remains 25,000.00 THB, and transaction "C-05 Persistence Test Deposit" (+5,000.00 THB) is preserved in Cloud SQL.*

### 13.3 Deployment Sequence & Multi-Version Drill Analysis

To maintain absolute technical precision and transparency regarding the deployment sequence and workflow modes:

| Workflow Run ID | Event Type | Head Commit / Image Tag | Deployment Mode | Active Cloud Run Revision | Traffic | Smoke Test | Data Persistence Verified |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| [`43597142988`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43597142988) | `push` (`main`) | `f160f256af24635cdc602b676a7cf8822fbbceb8` | Normal Forward Deploy (`DEPLOY_IS_ROLLBACK=false`, `SKIP_MIGRATIONS=false`) | `whatsss-00017-snp` | 100% | PASS | Verified baseline state |
| [`43598016213`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43598016213) | `workflow_dispatch` | `f160f256af24635cdc602b676a7cf8822fbbceb8` | Rollback Dispatch Drill (`DEPLOY_IS_ROLLBACK=true`, `SKIP_MIGRATIONS=true`) | `whatsss-00018-7jp` | 100% | PASS | Verified: 32,000 THB & deposit intact |
| [`43599307331`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43599307331) | `workflow_dispatch` | `f160f256af24635cdc602b676a7cf8822fbbceb8` | Redeploy Dispatch Drill (`DEPLOY_IS_ROLLBACK=true`, `SKIP_MIGRATIONS=true`) | `whatsss-00020-65k` | 100% | PASS | Verified: 32,000 THB & deposit intact |

#### Precise Status of Checkpoint C-05:
1. **Container Replacement & Database Persistence across Container Lifecycle Events:** **VERIFIED**
   - Live testing unequivocally proves that replacing Cloud Run container instances (via new revision rollout `whatsss-00020-65k`) retains 100% data integrity in Cloud SQL, with zero data loss or ledger distortion.
2. **Rollback Dispatch Automation Mechanics:** **VERIFIED**
   - Workflow runs `43598016213` and `43599307331` successfully verified the rollback execution path: test gates and image builds were skipped, migrations bypassed, healthy image rolled out to Cloud Run, and smoke tests confirmed live readiness.
3. **Multi-Version Roll-Forward Sequence (`Version B -> Version A -> Version B` across distinct images):** **PARTIALLY VERIFIED**
   - Because both dispatch runs (`43598016213` and `43599307331`) targeted image tag `f160f256af24635cdc602b676a7cf8822fbbceb8`, Run `43599307331` demonstrated revision redeployment, container replacement, and rollback dispatch execution, but not a forward deployment between two distinct release versions (A vs B). A full drill alternating between two distinct version images remains pending future multi-release testing.

---

## 14. Continuous Deployment Pipeline & Rollback Evidence (Checkpoint C-06)

### 14.1 Automated Deployment on `main` (Push Event)
* **Trigger:** Merge PR #35 into `main` (Commit `f160f256af24635cdc602b676a7cf8822fbbceb8`).
* **GitHub Actions Run ID:** [`43597142988`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43597142988)
* **Status:** **`COMPLETED / SUCCESS`**
* **Verification Gates Passed:**
  1. `test-and-docker`: Passed all 31 stages (Gitleaks, unit tests, integration tests, actionlint, shellcheck, Docker multi-stage build, secret inspection, compose e2e persistence).
  2. `WIF Authentication`: Authenticated keyless via Workload Identity Federation as `whatsss-deployer@cpe334-whatsss-pmandels.iam.gserviceaccount.com`.
  3. `Docker Build & Push`: Built with `provenance: false` to ensure immutable single-manifest digest matching Cloud Run revision spec.
  4. `Database Migration Job`: Executed `whatsss-migrate` Cloud Run Job synchronously with `DB_URL_VERSION=3`, verifying schema and seed idempotency before service rollout.
  5. `Cloud Run Rollout`: Deployed `whatsss` Cloud Run Service with 100% traffic allocation (Revision `whatsss-00017-snp`).
  6. `Revision & Traffic Verification`: Verified revision image digest, `APP_COMMIT_SHA=f160f256af24635cdc602b676a7cf8822fbbceb8`, and `100%` traffic allocation.
  7. `Automated HTTPS Smoke Test`:
     - `PASS /api/health` (commitSha: `f160f256af24635cdc602b676a7cf8822fbbceb8`)
     - `PASS /api/ready` (`database: connected`, commitSha: `f160f256af24635cdc602b676a7cf8822fbbceb8`)
     - `PASS /` (HTML landing document)
     - `PASS /api/accounts` (HTTP 401 unauthenticated security gate)

### 14.2 Automated Rollback Test (`workflow_dispatch`)
* **Trigger:** Manual operator dispatch on `main` specifying `image_tag: f160f256af24635cdc602b676a7cf8822fbbceb8`.
* **GitHub Actions Run ID:** [`43598016213`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43598016213)
* **Status:** **`COMPLETED / SUCCESS`**
* **Rollback Behavior Verified:**
  - `Test & Build Gate`: **`Skipped`** (immediate remediation constraint satisfied).
  - `Docker Build`: **`Skipped`** (existing image digest resolved directly from Artifact Registry).
  - `Migration Job`: **`Skipped`** (`SKIP_MIGRATIONS=true` prevents forward schema mutation during rollback).
  - `Cloud Run Service Rollout`: Updated service revision to specified image with 100% traffic (Revision `whatsss-00018-7jp`).
  - `Smoke Test`: All HTTPS health, readiness, and security probes passed 100%.
  - `Step Summary Report`: Recorded `Rollback mode: true` and `Overall status: SUCCESS`.

---

## 15. Cumulative Checkpoint Verification Matrix (C-01 through C-06)

| Checkpoint | Requirement | Status | Verification Evidence / Reference |
|:---:|---|:---:|---|
| **C-01** | PR Automated Test & Docker Build (`test-and-docker`) | **VERIFIED** | Feature PR #26 & Release PR #27; automated CI gate executes all 31 checks on every PR |
| **C-02** | Failed CI Check Blocks Merging (`protect-main`) | **VERIFIED** | Branch protection requires `test-and-docker` passing check and 1 approving review; direct push and failing PRs strictly blocked |
| **C-03** | Clean-Clone Build, Run & Data Persistence | **VERIFIED** | Automated in `test-and-docker` and `ci.yml` (clean clone, `.env.example`, special-char DB password, migration failure gate, 200/503/200 probes, 25,000 THB transaction, volume persistence across teardown) |
| **C-04** | Public Cloud Run Deployment & End-to-End Verification | **VERIFIED** | Live service at `https://whatsss-sipqw4logq-as.a.run.app`, Cloud SQL PostgreSQL 16 (`whatsss-sql`), Secret Manager, least-privilege SA, E2E workflow (`27,000 THB` Bank / `0 THB` Debt), rule rejections (`BR-04` & `BR-10`) |
| **C-05** | Data Persistence Across Revision Redeployment & Container Replacement | **PARTIALLY VERIFIED** | Container replacement & data persistence verified: `C-05 Persistence Test Deposit` (`+5,000.00 THB`) and Checking Bank balance `32,000.00 THB` preserved intact across Cloud Run revision redeployment / container replacement (Run ID `43599307331`, Revision `whatsss-00020-65k`); rollback dispatch mechanics verified (Run ID `43598016213`); distinct 3-version roll-forward drill (`B -> A -> B`) across different commit images remains pending. |
| **C-06** | Continuous Deployment Pipeline & Automated Rollback | **VERIFIED** | `.github/workflows/deploy.yml` with WIF, immutable digest deployment, migration job, 100% traffic, and smoke test (Push Run `43597142988` and Dispatch Rollback Run `43598016213`) |

---

## 16. Comprehensive Evidence Index Table

| ID | Checkpoint / Requirement | Evidence File | Description |
|:---:|:---:|---|---|
| **EVD-01** | C-04 / Public Cloud Run | [`evidence/c04-01-public-cloud-run-landing.png`](evidence/c04-01-public-cloud-run-landing.png) | Public HTTPS entry point (`https://whatsss-sipqw4logq-as.a.run.app/login`) |
| **EVD-02** | C-04 / Authentication | [`evidence/c04-02-user-login.png`](evidence/c04-02-user-login.png) | Successful login as `user_demo` receiving HttpOnly session cookie |
| **EVD-03** | C-04 / Transactions | [`evidence/c04-03-transaction-creation-recorded.png`](evidence/c04-03-transaction-creation-recorded.png) | Recorded Salary deposit (`20,000 THB`), split expense (`3,000 THB`), and repayment (`3,000 THB`) |
| **EVD-04** | C-04 / BR-04 Split Validation | [`evidence/c04-04-br04-unbalanced-split-rejection.png`](evidence/c04-04-br04-unbalanced-split-rejection.png) | Warning `Allocate the remaining ฿500.00 to continue` with submit button strictly disabled |
| **EVD-05** | C-04 / BR-10 Admin Segregation | [`evidence/c04-05-br10-admin-access-denied-403.png`](evidence/c04-05-br10-admin-access-denied-403.png) | Access Forbidden (403) when administrator attempts financial ledger operations |
| **EVD-06** | C-04 / Health Probes | [`evidence/c04-06-api-health-ready-probes.png`](evidence/c04-06-api-health-ready-probes.png) | `/api/health` 200 OK and `/api/ready` 200 OK (`database: connected`) on live public URL |
| **EVD-07** | C-04 / Cloud SQL Config | [`evidence/c04-07-cloud-sql-configuration.png`](evidence/c04-07-cloud-sql-configuration.png) | Cloud SQL instance `whatsss-sql` (`POSTGRES_16`, `db-f1-micro`, storage auto-increase disabled) |
| **EVD-08** | C-04 / Least-Privilege SA | [`evidence/c04-08-runtime-sa-and-iam.png`](evidence/c04-08-runtime-sa-and-iam.png) | Runtime SA `whatsss-runner` holding only `roles/cloudsql.client` and per-secret accessor |
| **EVD-09** | C-04 / Financial Dashboard | [`evidence/c04-09-user-demo-dashboard-final.png`](evidence/c04-09-user-demo-dashboard-final.png) | Final C-04 dashboard state with 27,000.00 THB balance and settled credit debt |
| **EVD-10** | C-04 / CloudShell IAM | [`evidence/c04-10-cloudshell-iam-cloudsql-client.jpg`](evidence/c04-10-cloudshell-iam-cloudsql-client.jpg) | IAM role binding for `roles/cloudsql.client` |
| **EVD-11** | C-04 / Secret Manager | [`evidence/c04-11-cloudshell-secretmanager-and-spec.png`](evidence/c04-11-cloudshell-secretmanager-and-spec.png) | Secret Manager configuration and Cloud Run revision environment specification |
| **EVD-12** | C-04 / Rotation Safety | [`evidence/c04-12-rotation-probe-failure-credential-mismatch.png`](evidence/c04-12-rotation-probe-failure-credential-mismatch.png) | Fail-closed behavior on password mismatch |
| **EVD-13** | C-04 / Logging Audit | [`evidence/c04-13-cloud-logging-prisma-auth-failed.png`](evidence/c04-13-cloud-logging-prisma-auth-failed.png) | Cloud Logging trace for authentication validation |
| **EVD-14** | C-04 / Healthy Revision Probes | [`evidence/c04-14-cloudshell-successful-revision-00006-probes.png`](evidence/c04-14-cloudshell-successful-revision-00006-probes.png) | Revision `whatsss-00006-9j1` serving 100% traffic with 200 OK probes |
| **EVD-15** | C-05 / Data Persistence Before Redeploy | [`evidence/c05-01-before-restart.png`](evidence/c05-01-before-restart.png) | Baseline financial ledger state before revision redeployment: record `C-05 Persistence Test Deposit` (`+5,000.00 THB`) created, Checking Bank balance `32,000.00 THB` on live URL |
| **EVD-16** | C-05 / Data Persistence After Redeploy | [`evidence/c05-02-after-restart.png`](evidence/c05-02-after-restart.png) | Zero data loss verified after Cloud Run revision redeployment / container replacement (Run ID `43599307331`, Revision `whatsss-00020-65k`): `32,000.00 THB` balance and test record intact |
| **EVD-17** | C-06 / Automated Deployment | [`Run #43597142988`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43597142988) | Automated CD workflow on `main` push (Commit `f160f25`), all 31 checks, migration job, rollout, smoke tests |
| **EVD-18** | C-06 / Rollback Verification | [`Run #43598016213`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43598016213) | `workflow_dispatch` rollback test with skipped test/build gate, bypassed migration, 100% traffic, smoke test |

---

## 17. Issue #23 Deliverables & Scope Clarification

In accordance with Lab 5 Handout Section 4.3, 11, and 12, Issue #23 encompasses both repository technical documentation and course report submission:

1. **Repository Deliverables (Covered in PR #36):**
   - Finalized production deployment runbook and verification documentation (`docs/labs/lab-05/deployment.md`).
   - Genuine, sanitized test evidence screenshots verifying Cloud Run end-to-end functionality (C-04) and data persistence across revision redeployment / container replacement (C-05) in `docs/labs/lab-05/evidence/`.
   - Comprehensive traceability matrix for CI/CD pipelines, Action SHA pinning, and least-privilege IAM configuration.

2. **Course Report Deliverables (Handout Section 12 — Submitted Separately):**
   - The consolidated course PDF document (`lab5_sec<section>_<group name>.pdf`) containing:
     - Written responses to **Answer Part 0 through Part 4**.
     - Formatted and sanitized **Evidence Index Table**.
     - Complete team **Contribution Table**.
   - As per project specifications, this report PDF is assembled and submitted directly to the course portal. PR #36 covers only the repository documentation and verification evidence; it does not contain the PDF submission or mark Issue #23 as complete until the PDF is reviewed, finalized, and submitted by the team before the 15 November 2026 23:59 deadline, and grading is completed.
