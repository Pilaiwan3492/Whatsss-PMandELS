#!/usr/bin/env bash
# ==============================================================================
# deploy/deploy.sh — First-Time GCP Infrastructure Provisioning & Initial Deploy
# Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
# Issue #19 (Episode 5): R-03, R-04, R-07 (Least Privilege), Check C-04
#
# Usage:
#   # 1. Dry-run verification (prints all commands without mutating GCP):
#   DRY_RUN=1 GCP_PROJECT_ID="your-gcp-project-id" bash deploy/deploy.sh
#
#   # 2. Live execution in GCP Cloud Shell:
#   GCP_PROJECT_ID="$(gcloud config get-value project)" bash deploy/deploy.sh
# ==============================================================================

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-${REGION:-asia-southeast1}}"

if [[ -z "${PROJECT_ID}" ]]; then
  if [[ "${DRY_RUN}" == "1" ]]; then
    PROJECT_ID="cpe334-whatsss-pmandels"
  else
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || echo 'cpe334-whatsss-pmandels')"
  fi
fi

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: GCP_PROJECT_ID is required. Set GCP_PROJECT_ID=<your-project-id>." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# Resource Naming Contract (All renamed for 'whatsss' per Issue #19)
# ------------------------------------------------------------------------------
APP_NAME="${APP_NAME:-whatsss}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-whatsss-runner}"
RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

AR_REPO="${AR_REPO:-whatsss}"
SQL_INSTANCE="${SQL_INSTANCE:-whatsss-sql}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
SQL_EDITION="${SQL_EDITION:-enterprise}"
SQL_DB_Version="${SQL_DB_VERSION:-POSTGRES_16}"
DB_NAME="${DB_NAME:-whatsss_db}"
DB_USER="${DB_USER:-whatsss_app}"

SECRET_DB_URL="${SECRET_DB_URL:-whatsss-database-url}"
SECRET_JWT="${SECRET_JWT:-whatsss-jwt-secret}"
SECRET_ADMIN_PWD="${SECRET_ADMIN_PWD:-whatsss-admin-password}"
SECRET_DEMO_PWD="${SECRET_DEMO_PWD:-whatsss-demo-password}"

MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-whatsss-migrate}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-whatsss}"

COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'initial')}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${APP_NAME}:${COMMIT_SHA}"
CLOUDSQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

create_or_update_secret() {
  local secret_name="$1"
  local secret_value="$2"

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY-RUN] create/update Secret Manager secret: ${secret_name} (value redacted)"
    return 0
  fi

  if ! gcloud secrets describe "${secret_name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    printf '%s' "${secret_value}" | gcloud secrets create "${secret_name}" \
      --project="${PROJECT_ID}" \
      --replication-policy="automatic" \
      --data-file=-
  else
    echo "Secret ${secret_name} already exists; preserving existing version unless FORCE_ROTATE_SECRETS=1."
    if [[ "${FORCE_ROTATE_SECRETS:-0}" == "1" ]]; then
      printf '%s' "${secret_value}" | gcloud secrets versions add "${secret_name}" \
        --project="${PROJECT_ID}" \
        --data-file=-
    fi
  fi
}

echo "=============================================================================="
echo " Whatsss GCP Deployment (DRY_RUN=${DRY_RUN})"
echo " Project ID : ${PROJECT_ID}"
echo " Region     : ${REGION}"
echo " Runtime SA : ${RUNTIME_SA_EMAIL}"
echo " Cloud SQL  : ${CLOUDSQL_CONNECTION_NAME} (${SQL_DB_Version}, ${SQL_EDITION}, ${SQL_TIER})"
echo " Image URI  : ${IMAGE_URI}"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# Step 1: Enable Required GCP APIs
# ------------------------------------------------------------------------------
echo "--> [1/9] Enabling required GCP APIs..."
run_cmd gcloud services enable \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}"

# ------------------------------------------------------------------------------
# Step 2: Create Least-Privilege Runtime Service Account (R-07)
# ------------------------------------------------------------------------------
echo "--> [2/9] Provisioning runtime service account (${RUNTIME_SA_NAME}) with least privilege..."
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
    --display-name="Whatsss Cloud Run Runtime Service Account" \
    --project="${PROJECT_ID}"
else
  if ! gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
      --display-name="Whatsss Cloud Run Runtime Service Account" \
      --project="${PROJECT_ID}"
  fi
fi

# R-07 Least Privilege: Runtime SA receives ONLY Cloud SQL Client at project level
run_cmd gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --condition=None

# ------------------------------------------------------------------------------
# Step 3: Create Artifact Registry Repository
# ------------------------------------------------------------------------------
echo "--> [3/9] Ensuring Artifact Registry repository (${AR_REPO})..."
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Whatsss production Docker images" \
    --project="${PROJECT_ID}"
else
  if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud artifacts repositories create "${AR_REPO}" \
      --repository-format=docker \
      --location="${REGION}" \
      --description="Whatsss production Docker images" \
      --project="${PROJECT_ID}"
  fi
fi

# ------------------------------------------------------------------------------
# Step 4: Provision Cloud SQL PostgreSQL 16 Instance + Mandatory Credit Protection
# ------------------------------------------------------------------------------
echo "--> [4/9] Ensuring Cloud SQL PostgreSQL 16 instance (${SQL_INSTANCE})..."
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud sql instances create "${SQL_INSTANCE}" \
    --database-version="${SQL_DB_Version}" \
    --edition="${SQL_EDITION}" \
    --tier="${SQL_TIER}" \
    --region="${REGION}" \
    --storage-size=10GB \
    --storage-type=SSD \
    --no-storage-auto-increase \
    --project="${PROJECT_ID}"
else
  if ! gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud sql instances create "${SQL_INSTANCE}" \
      --database-version="${SQL_DB_Version}" \
      --edition="${SQL_EDITION}" \
      --tier="${SQL_TIER}" \
      --region="${REGION}" \
      --storage-size=10GB \
      --storage-type=SSD \
      --no-storage-auto-increase \
      --project="${PROJECT_ID}"
  fi
fi

# MANDATORY CREDIT PROTECTION (Guide 5 / Issue #19): Explicitly disable storage auto-increase
echo "--> [4b/9] Enforcing mandatory Cloud SQL credit protection (--no-storage-auto-increase)..."
run_cmd gcloud sql instances patch "${SQL_INSTANCE}" \
  --no-storage-auto-increase \
  --project="${PROJECT_ID}"

# Create database & dedicated application database user
DB_PASSWORD="${WHATSSS_DB_PASSWORD:-$(openssl rand -hex 16)}"
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}"
  echo "[DRY-RUN] gcloud sql users create/set-password ${DB_USER} --instance=${SQL_INSTANCE} (password redacted)"
else
  if ! gcloud sql databases describe "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}"
  fi
  if ! gcloud sql users list --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" --format="value(name)" | grep -qx "${DB_USER}"; then
    gcloud sql users create "${DB_USER}" \
      --instance="${SQL_INSTANCE}" \
      --password="${DB_PASSWORD}" \
      --project="${PROJECT_ID}"
  elif [[ -n "${WHATSSS_DB_PASSWORD:-}" ]]; then
    gcloud sql users set-password "${DB_USER}" \
      --instance="${SQL_INSTANCE}" \
      --password="${DB_PASSWORD}" \
      --project="${PROJECT_ID}"
  fi
fi

# ------------------------------------------------------------------------------
# Step 5: Provision Secrets in Secret Manager & Bind Least-Privilege Accessor
# ------------------------------------------------------------------------------
echo "--> [5/9] Provisioning secrets in Secret Manager and binding ${RUNTIME_SA_EMAIL}..."
DATABASE_URL_VALUE="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?host=/cloudsql/${CLOUDSQL_CONNECTION_NAME}&schema=public"
JWT_SECRET_VALUE="${WHATSSS_JWT_SECRET:-$(openssl rand -hex 32)}"
ADMIN_PWD_VALUE="${WHATSSS_ADMIN_PASSWORD:-Admin_$(openssl rand -hex 12)!}"
DEMO_PWD_VALUE="${WHATSSS_DEMO_PASSWORD:-Demo_$(openssl rand -hex 12)!}"

create_or_update_secret "${SECRET_DB_URL}" "${DATABASE_URL_VALUE}"
create_or_update_secret "${SECRET_JWT}" "${JWT_SECRET_VALUE}"
create_or_update_secret "${SECRET_ADMIN_PWD}" "${ADMIN_PWD_VALUE}"
create_or_update_secret "${SECRET_DEMO_PWD}" "${DEMO_PWD_VALUE}"

for sec in "${SECRET_DB_URL}" "${SECRET_JWT}" "${SECRET_ADMIN_PWD}" "${SECRET_DEMO_PWD}"; do
  run_cmd gcloud secrets add-iam-policy-binding "${sec}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"
done

# ------------------------------------------------------------------------------
# Step 6: Build & Push Production Docker Image to Artifact Registry
# ------------------------------------------------------------------------------
echo "--> [6/9] Building and pushing Docker image (${IMAGE_URI})..."
run_cmd gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run_cmd docker build \
  --build-arg VITE_API_BASE_URL=/api \
  --build-arg APP_COMMIT_SHA="${COMMIT_SHA}" \
  -t "${IMAGE_URI}" .
run_cmd docker push "${IMAGE_URI}"

if [[ "${DRY_RUN}" == "1" ]]; then
  IMAGE_DIGEST="${IMAGE_URI}"
else
  IMAGE_DIGEST="$(gcloud artifacts docker images describe "${IMAGE_URI}" --format='value(image_summary.fully_qualified_digest)')"
fi

# ------------------------------------------------------------------------------
# Step 7: Delegate Migration Job + Cloud Run Service Rollout to deploy/release.sh
# ------------------------------------------------------------------------------
echo "--> [7/9] Invoking deploy/release.sh for migration job, seed, and Cloud Run deployment..."
DRY_RUN="${DRY_RUN}" \
GCP_PROJECT_ID="${PROJECT_ID}" \
GCP_REGION="${REGION}" \
IMAGE_REF="${IMAGE_DIGEST}" \
APP_COMMIT_SHA="${COMMIT_SHA}" \
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL}" \
CLOUDSQL_CONNECTION_NAME="${CLOUDSQL_CONNECTION_NAME}" \
SECRET_DB_URL="${SECRET_DB_URL}" \
SECRET_JWT="${SECRET_JWT}" \
SECRET_ADMIN_PWD="${SECRET_ADMIN_PWD}" \
SECRET_DEMO_PWD="${SECRET_DEMO_PWD}" \
MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME}" \
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE}" \
SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}" \
bash "$(dirname "$0")/release.sh"

echo "=============================================================================="
echo " Whatsss GCP Deployment Completed Successfully!"
echo "=============================================================================="
