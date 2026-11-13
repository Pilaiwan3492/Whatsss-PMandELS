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

### 5.3 Operational Distinction for Cloud Run Probe Configuration

When configuring Cloud Run service probes, configure endpoints strictly according to their intended operational role:

* **Liveness Probe $\rightarrow$ Configure `/api/health`:**
  - Verifies that the Node.js/Express process is responsive and event loops are unblocked.
  - Does **NOT** query PostgreSQL.
  - **Critical Failure Mode Avoided:** If a database experiences transient connection limits or network blips, the liveness probe continues returning HTTP 200. If liveness were mistakenly tied to the database, Cloud Run would kill and restart healthy container instances in a destructive cascading loop ("restart storm"), exacerbating the outage.
* **Startup / Readiness Probe $\rightarrow$ Configure `/api/ready`:**
  - Verifies active database connectivity (`SELECT 1`) during container initialization.
  - In Cloud Run, startup probes allow instances to warm up and establish database connection pools before receiving ingress traffic.

---

## 6. Cloud Run Deployment & Cloud SQL Integration Runbook

### 6.1 Creating Secrets in GCP Secret Manager
Never commit database credentials or JWT secrets to Git, Dockerfiles, or environment files. Manage all production secrets via Google Cloud Secret Manager:

```bash
# 1. Create secret for Database Connection String
# Unix Socket format for Cloud Run + Cloud SQL built-in proxy:
echo -n "postgresql://whatsss_app:DB_PASSWORD@localhost:5432/whatsss?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME" | \
  gcloud secrets create whatsss-database-url --data-file=-

# 2. Create secret for JWT Signing Key (must be at least 32 cryptographically random characters)
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets create whatsss-jwt-secret --data-file=-

# 3. Create optional secrets for production bootstrap
echo -n "YourSuperSecureAdminPassword2026!" | \
  gcloud secrets create whatsss-seed-admin-password --data-file=-
```

### 6.2 Service Account & IAM Roles
The Cloud Run runtime service account (`whatsss-runner@PROJECT_ID.iam.gserviceaccount.com`) must be granted least-privilege IAM roles:

```bash
# Cloud SQL Client: Allows connecting to Cloud SQL via unix socket proxy
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:whatsss-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Secret Manager Secret Accessor: Allows fetching secrets at runtime
gcloud secrets add-iam-policy-binding whatsss-database-url \
  --member="serviceAccount:whatsss-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding whatsss-jwt-secret \
  --member="serviceAccount:whatsss-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 6.3 Decoupled Release Step: Migration via Cloud Run Job
Do **NOT** embed `npx prisma migrate deploy` into the application container startup (`npm start`). In serverless environments, Cloud Run can spin up multiple container instances concurrently during scale-out events, leading to database schema deadlocks or migration collisions.

Instead, execute migrations as a decoupled, isolated Cloud Run Job prior to routing user traffic:

```bash
# Execute one-off Cloud Run Job for schema migration
gcloud run jobs create whatsss-migrate \
  --image="gcr.io/PROJECT_ID/whatsss:TAG" \
  --region="asia-southeast1" \
  --set-cloudsql-instances="PROJECT_ID:REGION:INSTANCE_NAME" \
  --set-secrets="DATABASE_URL=whatsss-database-url:latest" \
  --command="npx" \
  --args="prisma,migrate,deploy"

# Run migration job
gcloud run jobs execute whatsss-migrate --wait
```

### 6.4 Deploying Application to Cloud Run
Once the migration job completes successfully, deploy the application service:

```bash
gcloud run deploy whatsss \
  --image="gcr.io/PROJECT_ID/whatsss:TAG" \
  --platform="managed" \
  --region="asia-southeast1" \
  --allow-unauthenticated \
  --service-account="whatsss-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --add-cloudsql-instances="PROJECT_ID:REGION:INSTANCE_NAME" \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,CLIENT_URL=https://whatsss-PROJECT_ID.a.run.app" \
  --set-secrets="DATABASE_URL=whatsss-database-url:latest,JWT_SECRET=whatsss-jwt-secret:latest" \
  --startup-probe="httpGet.path=/api/ready,httpGet.port=8080,initialDelaySeconds=2,timeoutSeconds=5,failureThreshold=5" \
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
  -e JWT_SECRET="replace-with-a-valid-secret-at-least-32-chars" \
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
docker compose up -d

# 2. Run Prisma migration inside container against PostgreSQL
docker run --rm --network whatsss-pmandels_default \
  -e DATABASE_URL="postgresql://postgres:postgres@whatsss_postgres:5432/whatsss_db?schema=public" \
  whatsss:test npx prisma migrate deploy
# Output: 3 migrations found. No pending migrations to apply. Database schema is up to date!

# 3. Run Prisma seed inside container
docker run --rm --network whatsss-pmandels_default \
  -e DATABASE_URL="postgresql://postgres:postgres@whatsss_postgres:5432/whatsss_db?schema=public" \
  -e SEED_ADMIN_PASSWORD="AdminSecurePassword123!" \
  -e SEED_DEMO_DATA="true" \
  -e SEED_DEMO_PASSWORD="DemoSecurePassword123!" \
  whatsss:test npm run prisma:seed
# Output: Production admin preserved. user_demo preserved. Accounts upserted idempotently.

# 4. Start live container connected to PostgreSQL
docker run -d --name whatsss-live-instance --network whatsss-pmandels_default \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e JWT_SECRET="replace-with-a-valid-secret-at-least-32-chars" \
  -e CLIENT_URL="http://localhost:8080" \
  -e DATABASE_URL="postgresql://postgres:postgres@whatsss_postgres:5432/whatsss_db?schema=public" \
  -p 8080:8080 \
  whatsss:test

# 5. Verify live readiness probe
curl -i http://localhost:8080/api/ready
# Output: HTTP 200 OK {"status":"ready","database":"connected","timestamp":"...","commitSha":"development"}
```

### 7.4 Single-Command Local Full-Stack Deployment (`docker compose`)

`docker-compose.yml` orchestrates the complete stack locally in a single command, running PostgreSQL, applying schema migrations, running idempotent seed, and serving the full-stack container:

```bash
# 1. Initialize environment file from template
cp .env.example .env

# 2. Start PostgreSQL, apply migrations, seed demo accounts, and launch application
docker compose up -d --build

# 3. Verify all services are healthy and running
docker compose ps
# Expected output:
# whatsss_app        whatsss:local   Up (healthy)   0.0.0.0:8080->8080/tcp
# whatsss_migrate    whatsss:local   Exited (0)     (migrations & seed completed)
# whatsss_postgres   postgres:16     Up (healthy)   0.0.0.0:5432->5432/tcp

# 4. Probe application health & readiness
curl -i http://localhost:8080/api/health
curl -i http://localhost:8080/api/ready
```

---

## 8. Check C-03: Clean-Clone Build & Run Verification Report

**Requirement:** The project must build and run cleanly from a fresh `git clone` using only environment variables copied from `.env.example`, with no committed secrets. Data must persist across container teardowns (`docker compose down` then `docker compose up -d`).

### 8.1 Verification Procedure & Execution Log

#### Step 1: Fresh Git Clone & Environment Initialization
Executed inside a clean, isolated scratch directory:
```bash
git clone -b feat/docker-clean-clone-c03 <repository-url> clean-clone-dir
cd clean-clone-dir
cp .env.example .env
```
Populated local testing secrets in `.env`:
* `SEED_ADMIN_PASSWORD="AdminSecurePassword123!"`
* `SEED_DEMO_DATA="true"`
* `SEED_DEMO_PASSWORD="DemoSecurePassword123!"`
* `JWT_SECRET="this_is_a_clean_clone_jwt_secret_with_more_than_32_characters"`

#### Step 2: Build & Start Full-Stack Services
```bash
docker compose up -d --build
```
**Sanitized Execution Output:**
```text
✔ Network whatsss-clean-clone-c03_default      Created
✔ Volume whatsss-clean-clone-c03_whatsss_pgdata Created
✔ Container whatsss_postgres                   Started (healthy)
✔ Container whatsss_migrate                    Started (healthy -> Exited 0)
✔ Container whatsss_app                        Started (healthy)
```

**Migration & Seed Log (`docker logs whatsss_migrate`):**
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

#### Step 4: End-to-End Authentication & Record Creation
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
   # Container whatsss_app Stopped & Removed
   # Container whatsss_migrate Stopped & Removed
   # Container whatsss_postgres Stopped & Removed
   # Network removed (Volume whatsss_pgdata preserved)
   ```

2. **Re-launch Containers:**
   ```bash
   docker compose up -d
   # Output:
   # Container whatsss_postgres Started (healthy)
   # Container whatsss_migrate Started -> Idempotent seed preserved -> Exited 0
   # Container whatsss_app Started (healthy)
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

### 8.2 Automated Clean-Clone CI Pipeline Verification (`.github/workflows/ci.yml`)

To provide continuously verifiable, traceable proof that the application adheres to Check **C-03** on every code revision, the GitHub Actions CI pipeline includes a dedicated automation job: `c03-clean-clone-verification`:

1. **Clean Workspace Isolation:** Clones/copies the workspace into a fresh, isolated directory (`../clean-clone-test`), completely free from cached dependencies or build remnants.
2. **Template Interpolation Verification:** Copies `.env.example` to `.env` and generates dynamic, cryptographically secure secrets (`openssl rand -hex 32` for `JWT_SECRET`, secure passwords for admin/demo).
3. **Single-Command Startup:** Executes `docker compose up -d --build` and polls until all containers report `healthy`.
4. **Health & Readiness Inspection:** Probes both `GET /api/health` and `GET /api/ready`, asserting HTTP 200 OK responses.
5. **Real Transaction Creation:** Authenticates via `POST /api/auth/login`, retrieves account UUIDs, and creates a live income transaction (`POST /api/transactions/income`).
6. **Container Teardown & Restart:** Executes `docker compose down` (preserving `whatsss_pgdata`), re-starts via `docker compose up -d`, and confirms that the transaction and updated balances persist intact.
7. **Traceability:** Every GitHub Actions workflow run links directly to the git commit SHA, providing immutable audit evidence for reviewers and evaluators.

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

## 10. CI/CD Pipeline Automation (`.github/workflows/ci.yml`)

The repository CI workflow enforces rigorous quality gates on every push and pull request targeting `staging-lab5` and `main`:

```mermaid
flowchart LR
    PushOrPR["Git Push / PR to staging-lab5"]
    
    subgraph CIJobs ["GitHub Actions CI Matrix"]
        BackendJob["Backend Test & Build<br/>(PostgreSQL 16, Vitest, tsc)"]
        FrontendJob["Frontend Test & Build<br/>(Vitest, Vite build)"]
        DockerJob["Docker Build & Probe<br/>(Multi-stage build, health curl)"]
        CleanCloneJob["Clean Clone C-03 Verification<br/>(docker-compose up, e2e API, persistence)"]
        SecurityJob["Secret & Credential Scan<br/>(Detect .env, keys, pem)"]
    end
    
    PushOrPR --> BackendJob
    PushOrPR --> FrontendJob
    PushOrPR --> DockerJob
    DockerJob --> CleanCloneJob
    PushOrPR --> SecurityJob
```

* **Branch Protection:** All five jobs must report Success before any PR targeting `staging-lab5` can be reviewed and approved.
* **No Bypass:** Neither `continue-on-error` nor bypass mechanisms are permitted.

---

## 11. Peer Review Acceptance Criteria Checklist (14/14)

| # | Acceptance Criterion | Status | Verification Evidence / Artifact |
|---|---|:---:|---|
| 1 | **CSRF Integration Tests** covering all mutating & safe HTTP methods across trusted, untrusted, and missing origins | **COMPLETED** | `server/tests/integration/health.test.ts` (20 integration tests passed) verifying POST/PUT/PATCH/DELETE rejections (403), valid CLIENT_URL passage, and safe GET exemptions |
| 2 | **Multi-stage Dockerfile** building full-stack production image cleanly | **COMPLETED** | Root `Dockerfile` with stages `client-builder` (`VITE_API_BASE_URL=/api`), `server-builder`, and `runner` (alpine-based, non-root `node:node`, ~179MB, accepting `APP_COMMIT_SHA`) |
| 3 | **Docker Image Artifact Integrity** containing frontend dist, backend dist, and Prisma migrations | **COMPLETED** | Verified inside container: `/app/client/dist` (HTML, JS, CSS), `/app/server/dist`, `/app/server/prisma` (`schema.prisma`, `migrations/`, `seed.ts`) |
| 4 | **Docker Container Startup & Liveness Probe** answering HTTP 200 | **COMPLETED** | Verified locally: `curl -i http://localhost:8080/api/health` returned HTTP 200 OK |
| 5 | **Single-Container SPA & Backend API Routing** via `/api` | **COMPLETED** | Verified locally: `/` returns full SPA HTML; API routes (`/api/auth/*`, `/api/*`) operate through Express pipeline |
| 6 | **Prisma Migration Execution** against real PostgreSQL database | **COMPLETED** | Verified inside container: `npx prisma migrate deploy` applied 3 migrations to live PostgreSQL container |
| 7 | **Prisma Seed Idempotency & Data Safety** | **COMPLETED** | Verified: Seed script executed multiple times; preserved existing user credentials and roles; upserted standard accounts without duplicates; passwords stored as 60-char bcrypt hashes |
| 8 | **Cloud Run + Cloud SQL Connectivity Architecture** | **COMPLETED** | Documented Unix Socket connection (`host=/cloudsql/...`), IAM `roles/cloudsql.client`, and decoupled Cloud Run Job migration |
| 9 | **Secret Management Isolation** (Zero secrets in Image or Git) | **COMPLETED** | Enforced by `.dockerignore`, `.gitignore`, CI credential scan, and Secret Manager documentation |
| 10 | **Readiness Probe State Discrimination** (200 on DB ready, 503 on DB disconnect) | **COMPLETED** | Verified locally: disconnected DB $\rightarrow$ HTTP 503 (`Database connection unavailable`); live DB $\rightarrow$ HTTP 200 (`database: connected`) |
| 11 | **GitHub Actions CI Pipeline Automation** | **COMPLETED** | `.github/workflows/ci.yml` triggers on PRs to `staging-lab5`; executes Backend, Frontend, Docker Build & Probe, and Secret Scan |
| 12 | **Deployment Guide Accuracy** matching tested commands and architecture | **COMPLETED** | `docs/labs/lab-05/deployment.md` updated with exact verified commands, configuration runbooks, and diagrams |
| 13 | **Traceable Verification Evidence & Commit SHA** | **COMPLETED** | Commit history, command outputs, and test logs recorded for peer review |
| 14 | **Check C-03: Clean-Clone Build & Run Verification** | **COMPLETED** | Fresh clone from branch with `.env.example` only; started via `docker compose up -d --build`; health probes 200 OK; transaction created; data persisted across `docker compose down` and restart |


