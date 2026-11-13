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
| **Cloud Run Service** | `whatsss` (Active revision: `whatsss-00002-7k4`) | `--min-instances=0`, `--max-instances=3`, `--port=8080`, `NODE_ENV=production`, `HOST=0.0.0.0` |
| **Live Public Cloud Run URLs** | Primary (`CLIENT_URL`): `https://whatsss-sipqw4logq-as.a.run.app`<br/>Regional Endpoint: `https://whatsss-1086708130644.asia-southeast1.run.app` | `CLIENT_URL` synchronized with primary HTTPS URL so `csrfGuard.ts` strict `Origin` check passes |

### 6.1 Automated Infrastructure & Release Scripts (`deploy/deploy.sh` & `deploy/release.sh`)
Two repeatable deployment scripts in `deploy/` automate first-time infrastructure provisioning and subsequent releases:
1. **`deploy/deploy.sh` (First-Time Provisioning + Build + Release):**
   - Supports dry-run inspection (`DRY_RUN=1 GCP_PROJECT_ID="cpe334-whatsss-pmandels" bash deploy/deploy.sh`) to verify all `gcloud` and `docker` commands before mutating cloud state.
   - Enables required GCP APIs, creates the `whatsss-runner` runtime service account, provisions the `whatsss` Artifact Registry repository and `whatsss-sql` Cloud SQL PostgreSQL 16 instance with mandatory `--no-storage-auto-increase` credit protection, creates/preserves Secret Manager secrets, builds and pushes the production image by commit SHA/digest, and invokes `deploy/release.sh`.
2. **`deploy/release.sh` (Decoupled Migration Job + Cloud Run Service Rollout):**
   - Deploys and executes the `whatsss-migrate` Cloud Run Job with `--wait` (`sh -c "npx prisma migrate deploy && npm run prisma:seed"`).
   - Deploys the `whatsss` Cloud Run Service (`--min-instances=0 --max-instances=3 --allow-unauthenticated`) and automatically synchronizes `CLIENT_URL` with the live Cloud Run HTTPS URL.

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
| **Verified PR Head SHA** | `e86ee2a581fd847bc2b1508e191ba20550398ac3` (`e86ee2a`, merged as `015d9c0`; Cloud Run C-04 deployed from `2a7c4c7343e6426cfca713d3288d495dfed5f92d`) |
| **CI Run (PR `ci-docker.yml`)** | [CI Run #10 (`43459279046`, Job `132001551007` `test-and-docker`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459279046/job/132001551007) (and prior Run #9 [`43454153068`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43454153068/job/131983775013)) — **PASSED** |
| **CI Run (Push `ci.yml`)** | [Run `43459265389` (`Backend`, `Frontend`, `Docker`, `Secret Scan`, `Check C-03`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459265389) — **PASSED** |
| **Backend Test** | **PASSED** — 9 unit test suites (144 tests: `seed.test.ts` 34, `testSafety.test.ts` 27, `config.test.ts` 23, `decimal.test.ts` 16, `splitAllocation.test.ts` 15, `health.test.ts` 11, `accountLock.test.ts` 9, `balance.test.ts` 5, `password.test.ts` 4) + 12 integration & E2E suites (`npm test` & `npm run build` on Node.js 24 LTS) |
| **Frontend Test** | **PASSED** — 7 test suites (55 tests) + Vite production bundle build (`npm test` & `npm run build` on Node.js 24 LTS) |
| **Docker Build** | **PASSED** — Multi-stage `node:24-alpine` production image built, layer/filesystem secret inspection clean, `/api/health` (200), `/api/ready` (200), and `/` SPA verified |
| **C-03 Clean Clone** | **PASSED** — Verified in both `test-and-docker` ([CI Run #10 Job `132001551007`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459279046/job/132001551007)) and `c03-clean-clone-verification` ([Job `132001966691`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/43459265389/job/132001966691)): clean clone, special-char DB password, `docker compose config -q`, migration failure gate, 200/503/200 probes, 25,000 THB transaction, and volume persistence across restart |
| **Cloud Deploy (C-04)** | **COMPLETED** — Live on Google Cloud Run at `https://whatsss-sipqw4logq-as.a.run.app` (`https://whatsss-1086708130644.asia-southeast1.run.app`), Revision `whatsss-00002-7k4`, Image digest `asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781`, connected to Cloud SQL `whatsss-sql` (`POSTGRES_16`, `db-f1-micro`, `--no-storage-auto-increase`); `/api/health` (200), `/api/ready` (200, `"database":"connected"`), E2E workflow (`27,000.00 THB` Bank / `0.00 THB` Debt), and rule rejections (`BR-04` unbalanced split & `BR-10` Admin `403`) verified |

---

## 11. Peer Review Acceptance Criteria Checklist (16/16 Completed)

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
| 12 | **Check C-01: PR Automated Test & Docker Build (`test-and-docker`)** | **COMPLETED** | Verified on Feature PR #26 (approved by `@Pilaiwan3492` in Review `5891356921` and merged in `b113cdf`) and Release PR #27 (`staging-lab5 -> main`, CI Run #10 `43459279046` & Run #9 `43454153068`); the unified `test-and-docker` job completes all backend, frontend, Docker, and C-03 checks |
| 13 | **Deployment Guide Accuracy** matching tested commands and architecture | **COMPLETED** | `docs/labs/lab-05/deployment.md`, `deploy/deploy.sh`, and `deploy/release.sh` updated with exact verified GCP resource names, Node.js 24 LTS runtime, configuration runbooks, and diagrams |
| 14 | **Traceable Verification Evidence & Commit SHA** | **COMPLETED** | Feature PR #26 approved and merged (`b113cdf`); Release PR #27 (`staging-lab5 -> main`) approved and merged by `@Pilaiwan3492` (`015d9c0`); Cloud Run revision `whatsss-00002-7k4` deployed and verified with live `commitSha` |
| 15 | **Check C-03: Clean-Clone Build & Run Verification** | **COMPLETED** | Automated in both `ci-docker.yml` (PRs, Job `132001551007`) and `ci.yml` (pushes, Job `132001966691`): fresh clone, `.env.example` with special-char DB password & URL-encoded `DOCKER_DATABASE_URL`, migration failure gate, 200/503/200 probes, 25,000 THB transaction creation, and volume persistence across teardown |
| 16 | **Check C-04: Public Cloud Run Deployment & End-to-End Verification (Issue #19)** | **COMPLETED** | Live at `https://whatsss-sipqw4logq-as.a.run.app` (Section 8.3): `/api/health` (200), `/api/ready` (200, `"database":"connected"`), `user_demo` E2E workflow (Opening `10,000 THB` $\rightarrow$ Income `+20,000 THB` $\rightarrow$ Split Expense `-3,000 THB` $\rightarrow$ Repayment `-3,000 THB` $\rightarrow$ `27,000 THB` Bank / `0 THB` Debt), and rule rejections (`BR-04` unbalanced split & `BR-10` Admin `403`) verified |


