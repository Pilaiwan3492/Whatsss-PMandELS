#!/usr/bin/env bash
# ==============================================================================
# deploy/release.sh — Repeatable Cloud Run Migration Job & Service Rollout
# Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
# Issue #19 (Episode 5) & Issue #21 (Episode 7)
#
# Responsibilities:
# 1. Create or update the decoupled Cloud Run Job (`whatsss-migrate`) running
#    `npx prisma migrate deploy` and idempotent `npm run prisma:seed`.
# 2. Execute `whatsss-migrate` with `--wait` before routing traffic.
# 3. Deploy Cloud Run Service (`whatsss`) with `--min-instances=0`,
#    `--max-instances=3`, `--allow-unauthenticated`, `NODE_ENV=production`,
#    and least-privilege runtime service account `whatsss-runner`.
# 4. Resolve the exact live HTTPS Cloud Run Service URL and update `CLIENT_URL`
#    so `csrfGuard.ts` Origin validation and Secure cookies match the live origin.
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
  echo "ERROR: GCP_PROJECT_ID is required." >&2
  exit 1
fi

APP_NAME="${APP_NAME:-whatsss}"
AR_REPO="${AR_REPO:-whatsss}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-whatsss-runner}"
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"

SQL_INSTANCE="${SQL_INSTANCE:-whatsss-sql}"
CLOUDSQL_CONNECTION_NAME="${CLOUDSQL_CONNECTION_NAME:-${PROJECT_ID}:${REGION}:${SQL_INSTANCE}}"

SECRET_DB_URL="${SECRET_DB_URL:-whatsss-database-url}"
SECRET_JWT="${SECRET_JWT:-whatsss-jwt-secret}"
SECRET_ADMIN_PWD="${SECRET_ADMIN_PWD:-whatsss-admin-password}"
SECRET_DEMO_PWD="${SECRET_DEMO_PWD:-whatsss-demo-password}"

MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-whatsss-migrate}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-whatsss}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"

COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'production')}"
IMAGE_REF="${IMAGE_REF:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${APP_NAME}:${COMMIT_SHA}}"

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

echo "------------------------------------------------------------------------------"
echo " Whatsss Release Rollout (DRY_RUN=${DRY_RUN})"
echo " Image Ref  : ${IMAGE_REF}"
echo " Commit SHA : ${COMMIT_SHA}"
echo "------------------------------------------------------------------------------"

# ------------------------------------------------------------------------------
# Step 1: Deploy & Execute Cloud Run Migration + Seed Job
# ------------------------------------------------------------------------------
echo "--> [1/3] Configuring and executing Cloud Run Job (${MIGRATE_JOB_NAME})..."
JOB_ARGS=(
  "${MIGRATE_JOB_NAME}"
  "--image=${IMAGE_REF}"
  "--region=${REGION}"
  "--project=${PROJECT_ID}"
  "--service-account=${RUNTIME_SA_EMAIL}"
  "--set-cloudsql-instances=${CLOUDSQL_CONNECTION_NAME}"
  "--set-env-vars=NODE_ENV=production,SEED_DEMO_DATA=${SEED_DEMO_DATA}"
  "--set-secrets=DATABASE_URL=${SECRET_DB_URL}:latest,SEED_ADMIN_PASSWORD=${SECRET_ADMIN_PWD}:latest,SEED_DEMO_PASSWORD=${SECRET_DEMO_PWD}:latest"
  "--max-retries=1"
  "--task-timeout=300s"
  "--command=sh"
  "--args=-c,npx prisma migrate deploy && npm run prisma:seed"
)

if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud run jobs deploy "${JOB_ARGS[@]}"
  run_cmd gcloud run jobs execute "${MIGRATE_JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" --wait
else
  run_cmd gcloud run jobs deploy "${JOB_ARGS[@]}"
  run_cmd gcloud run jobs execute "${MIGRATE_JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" --wait
fi

# ------------------------------------------------------------------------------
# Step 2: Deploy Cloud Run Service (`whatsss`)
# ------------------------------------------------------------------------------
echo "--> [2/3] Deploying Cloud Run Service (${CLOUD_RUN_SERVICE})..."
EXISTING_URL=""
if [[ "${DRY_RUN}" != "1" ]]; then
  EXISTING_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)' 2>/dev/null || true)"
fi
INITIAL_CLIENT_URL="${CLIENT_URL:-${EXISTING_URL:-https://${CLOUD_RUN_SERVICE}-${PROJECT_ID}.${REGION}.run.app}}"

run_cmd gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --image="${IMAGE_REF}" \
  --platform=managed \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --allow-unauthenticated \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --add-cloudsql-instances="${CLOUDSQL_CONNECTION_NAME}" \
  --min-instances=0 \
  --max-instances=3 \
  --port=8080 \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,APP_COMMIT_SHA=${COMMIT_SHA},CLIENT_URL=${INITIAL_CLIENT_URL}" \
  --set-secrets="DATABASE_URL=${SECRET_DB_URL}:latest,JWT_SECRET=${SECRET_JWT}:latest" \
  --startup-probe="httpGet.path=/api/ready,httpGet.port=8080,initialDelaySeconds=2,periodSeconds=5,timeoutSeconds=4,failureThreshold=6" \
  --liveness-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,periodSeconds=15,timeoutSeconds=3,failureThreshold=3"

# ------------------------------------------------------------------------------
# Step 3: Synchronize CLIENT_URL with Exact Live Cloud Run HTTPS URL (CSRF Guard)
# ------------------------------------------------------------------------------
echo "--> [3/3] Resolving live Cloud Run HTTPS URL and synchronizing CLIENT_URL..."
if [[ "${DRY_RUN}" == "1" ]]; then
  SERVICE_URL="https://${CLOUD_RUN_SERVICE}-example.${REGION}.run.app"
  run_cmd gcloud run services update "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --update-env-vars="CLIENT_URL=${SERVICE_URL}"
else
  SERVICE_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)')"

  if [[ -n "${SERVICE_URL}" && "${SERVICE_URL}" != "${INITIAL_CLIENT_URL}" ]]; then
    run_cmd gcloud run services update "${CLOUD_RUN_SERVICE}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --update-env-vars="CLIENT_URL=${SERVICE_URL}"
  fi
fi

echo "Live Cloud Run Service URL: ${SERVICE_URL}"
