#!/usr/bin/env bash
# ==============================================================================
# deploy/release.sh — Repeatable Cloud Run Migration Job & Service Rollout
# Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
# Issue #19 (Episode 5) & Issue #21 (Episode 7 CD Contract)
#
# Contract Inputs:
#   GCP_PROJECT_ID           : Target GCP Project ID (Required)
#   GCP_REGION               : Target GCP Region (Default: asia-southeast1)
#   IMAGE_REF                : Immutable Docker image URI/digest to release
#   RUNTIME_SA_EMAIL         : Least-privilege runtime service account email
#   CLOUDSQL_CONNECTION_NAME : Cloud SQL instance connection name
#   SECRET_DB_URL            : Secret Manager name for DATABASE_URL
#   SECRET_JWT               : Secret Manager name for JWT_SECRET
#   SECRET_ADMIN_PWD         : Secret Manager name for SEED_ADMIN_PASSWORD
#   SECRET_DEMO_PWD          : Secret Manager name for SEED_DEMO_PASSWORD
#   MIGRATE_JOB_NAME         : Cloud Run Job name for schema migration & seed
#   CLOUD_RUN_SERVICE        : Cloud Run Service name
#   DRY_RUN                  : Set to 1 to print commands without mutating GCP
# ==============================================================================

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-${REGION:-asia-southeast1}}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: GCP_PROJECT_ID is required." >&2
  exit 1
fi

for cmd in gcloud curl; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: Required dependency '${cmd}' is not installed or not in PATH." >&2
    exit 1
  fi
done

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

if [[ -z "${APP_COMMIT_SHA:-}" ]]; then
  echo "ERROR: APP_COMMIT_SHA is required." >&2
  exit 1
fi
if [[ ! "${APP_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: APP_COMMIT_SHA must be a full 40-character Git SHA." >&2
  exit 1
fi
COMMIT_SHA="${APP_COMMIT_SHA}"

if [[ -z "${IMAGE_REF:-}" ]]; then
  echo "ERROR: IMAGE_REF is required." >&2
  exit 1
fi
if [[ ! "${IMAGE_REF}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: IMAGE_REF must use an immutable sha256 digest." >&2
  exit 1
fi

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

resolve_secret_version() {
  local secret_name="$1"
  local explicit_version="${2:-}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "${explicit_version:-1}"
    return 0
  fi

  local ver="${explicit_version:-}"
  if [[ -z "${ver}" ]]; then
    local version_name
    version_name="$(gcloud secrets versions list "${secret_name}" \
      --project="${PROJECT_ID}" \
      --filter="state=ENABLED" \
      --limit=1 \
      --format="value(name)" 2>/dev/null || true)"

    if [[ -z "${version_name}" ]]; then
      echo "ERROR: Secret ${secret_name} has no ENABLED version in Secret Manager." >&2
      exit 1
    fi
    ver="${version_name##*/}"
  fi

  if [[ ! "${ver}" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Secret ${secret_name} version must be a numeric version, got '${ver}'." >&2
    exit 1
  fi

  local ver_state
  ver_state="$(gcloud secrets versions describe "${ver}" \
    --secret="${secret_name}" \
    --project="${PROJECT_ID}" \
    --format="value(state)" 2>/dev/null || true)"

  if [[ "${ver_state}" != "ENABLED" ]]; then
    echo "ERROR: Secret ${secret_name} version ${ver} is missing or not ENABLED (state: '${ver_state}')." >&2
    exit 1
  fi

  echo "${ver}"
}

DB_URL_VER="$(resolve_secret_version "${SECRET_DB_URL}" "${SECRET_DB_URL_VERSION:-}")"
JWT_VER="$(resolve_secret_version "${SECRET_JWT}" "${SECRET_JWT_VERSION:-}")"
ADMIN_PWD_VER="$(resolve_secret_version "${SECRET_ADMIN_PWD}" "${SECRET_ADMIN_PWD_VERSION:-}")"
DEMO_PWD_VER="$(resolve_secret_version "${SECRET_DEMO_PWD}" "${SECRET_DEMO_PWD_VERSION:-}")"

echo "------------------------------------------------------------------------------"
echo " Whatsss Release Rollout (DRY_RUN=${DRY_RUN})"
echo " Project ID : ${PROJECT_ID}"
echo " Region     : ${REGION}"
echo " Image Ref  : ${IMAGE_REF}"
echo " Commit SHA : ${COMMIT_SHA}"
echo " Runtime SA : ${RUNTIME_SA_EMAIL}"
echo "------------------------------------------------------------------------------"

# ------------------------------------------------------------------------------
# Step 1: Deploy & Execute Cloud Run Migration + Seed Job (Gate Before Service)
# ------------------------------------------------------------------------------
echo "--> [1/4] Configuring and executing Cloud Run Job (${MIGRATE_JOB_NAME})..."
JOB_ARGS=(
  "${MIGRATE_JOB_NAME}"
  "--image=${IMAGE_REF}"
  "--region=${REGION}"
  "--project=${PROJECT_ID}"
  "--service-account=${RUNTIME_SA_EMAIL}"
  "--set-cloudsql-instances=${CLOUDSQL_CONNECTION_NAME}"
  "--set-env-vars=NODE_ENV=production,SEED_DEMO_DATA=${SEED_DEMO_DATA}"
  "--set-secrets=DATABASE_URL=${SECRET_DB_URL}:${DB_URL_VER},SEED_ADMIN_PASSWORD=${SECRET_ADMIN_PWD}:${ADMIN_PWD_VER},SEED_DEMO_PASSWORD=${SECRET_DEMO_PWD}:${DEMO_PWD_VER}"
  "--max-retries=1"
  "--task-timeout=300s"
  "--command=sh"
  "--args=-c,npx prisma migrate deploy && npm run prisma:seed"
)

if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud run jobs deploy "${JOB_ARGS[@]}"
  run_cmd gcloud run jobs execute "${MIGRATE_JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" --wait
else
  if ! run_cmd gcloud run jobs deploy "${JOB_ARGS[@]}"; then
    echo "ERROR: Failed to configure migration job ${MIGRATE_JOB_NAME}. Service deployment aborted." >&2
    exit 1
  fi

  JOB_SA="$(gcloud run jobs describe "${MIGRATE_JOB_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(spec.template.spec.template.spec.serviceAccountName)" 2>/dev/null || true)"
  if [[ "${JOB_SA}" != "${RUNTIME_SA_EMAIL}" ]]; then
    echo "ERROR: Migration job service account mismatch. Expected '${RUNTIME_SA_EMAIL}', got '${JOB_SA}'." >&2
    exit 1
  fi

  if ! gcloud run jobs execute "${MIGRATE_JOB_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --wait; then
    echo "ERROR: Migration job failed. Service deployment aborted." >&2
    exit 1
  fi

  LATEST_EXECUTION="$(gcloud run jobs executions list \
    --job="${MIGRATE_JOB_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --limit=1 \
    --format="value(metadata.name)" 2>/dev/null || true)"
  LATEST_EXECUTION="${LATEST_EXECUTION##*/}"

  if [[ -z "${LATEST_EXECUTION}" ]]; then
    echo "ERROR: Could not verify migration job execution ID for ${MIGRATE_JOB_NAME}. Service deployment aborted." >&2
    exit 1
  fi

  EXECUTION_SUCCEEDED="$(gcloud run jobs executions describe "${LATEST_EXECUTION}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(status.succeededCount)" 2>/dev/null || echo '0')"

  if [[ -z "${EXECUTION_SUCCEEDED}" || "${EXECUTION_SUCCEEDED}" -lt 1 ]]; then
    echo "ERROR: Migration job execution '${LATEST_EXECUTION}' did not report succeeded status (succeededCount=${EXECUTION_SUCCEEDED}). Service deployment aborted." >&2
    exit 1
  fi

  echo "Migration & seed job execution verified: ${LATEST_EXECUTION} (status: SUCCEEDED)"
fi

# ------------------------------------------------------------------------------
# Step 2: Deploy Cloud Run Service (`whatsss`)
# ------------------------------------------------------------------------------
echo "--> [2/4] Deploying Cloud Run Service (${CLOUD_RUN_SERVICE})..."
EXISTING_URL=""
if [[ "${DRY_RUN}" != "1" ]]; then
  EXISTING_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)' 2>/dev/null || true)"
fi

if [[ -n "${EXISTING_URL}" && "${EXISTING_URL}" == https://* ]]; then
  INITIAL_CLIENT_URL="${EXISTING_URL}"
else
  # Safe RFC 2606 reserved HTTPS placeholder for first-time creation before real URL is assigned
  INITIAL_CLIENT_URL="https://bootstrap-pending.invalid"
fi

if ! run_cmd gcloud run deploy "${CLOUD_RUN_SERVICE}" \
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
  --set-secrets="DATABASE_URL=${SECRET_DB_URL}:${DB_URL_VER},JWT_SECRET=${SECRET_JWT}:${JWT_VER}" \
  --startup-probe="httpGet.path=/api/ready,httpGet.port=8080,initialDelaySeconds=2,periodSeconds=5,timeoutSeconds=4,failureThreshold=6" \
  --liveness-probe="httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=5,periodSeconds=15,timeoutSeconds=3,failureThreshold=3"; then
  echo "ERROR: Failed to deploy Cloud Run Service ${CLOUD_RUN_SERVICE}." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# Step 3: Synchronize CLIENT_URL with Exact Live Cloud Run HTTPS URL & Verify SA
# ------------------------------------------------------------------------------
echo "--> [3/4] Resolving live Cloud Run HTTPS URL and synchronizing CLIENT_URL..."
if [[ "${DRY_RUN}" == "1" ]]; then
  SERVICE_URL="https://${CLOUD_RUN_SERVICE}-dryrun.${REGION}.run.app"
  run_cmd gcloud run services update "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --update-env-vars="CLIENT_URL=${SERVICE_URL}"
else
  SERVICE_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)' 2>/dev/null || true)"

  if [[ -z "${SERVICE_URL}" || "${SERVICE_URL}" != https://* ]]; then
    echo "ERROR: Invalid Cloud Run Service URL ('${SERVICE_URL}'). Expected a valid https:// URL." >&2
    exit 1
  fi

  if ! run_cmd gcloud run services update "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --update-env-vars="CLIENT_URL=${SERVICE_URL}"; then
    echo "ERROR: Failed to update CLIENT_URL on Cloud Run service ${CLOUD_RUN_SERVICE}." >&2
    exit 1
  fi

  VERIFIED_CLIENT_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --flatten="spec.template.spec.containers[].env[]" \
    --filter="spec.template.spec.containers.env.name=CLIENT_URL" \
    --format="value(spec.template.spec.containers.env.value)" 2>/dev/null || true)"

  if [[ "${VERIFIED_CLIENT_URL}" != "${SERVICE_URL}" ]]; then
    echo "ERROR: Post-update CLIENT_URL verification failed. Expected '${SERVICE_URL}', got '${VERIFIED_CLIENT_URL}'." >&2
    exit 1
  fi

  SERVICE_SA="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(spec.template.spec.serviceAccountName)" 2>/dev/null || true)"

  if [[ "${SERVICE_SA}" != "${RUNTIME_SA_EMAIL}" ]]; then
    echo "ERROR: Cloud Run service account mismatch. Expected '${RUNTIME_SA_EMAIL}', got '${SERVICE_SA}'." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Step 4: Post-Release Smoke Verification (/api/health & /api/ready)
# ------------------------------------------------------------------------------
echo "--> [4/4] Verifying live health and readiness probes on ${SERVICE_URL}..."
if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[DRY-RUN] curl -fsS ${SERVICE_URL}/api/health"
  echo "[DRY-RUN] curl -fsS ${SERVICE_URL}/api/ready"
else
  HEALTH_BODY="$(curl -fsS "${SERVICE_URL}/api/health" || true)"
  if [[ "${HEALTH_BODY}" != *'"status":"ok"'* ]]; then
    echo "ERROR: Post-release /api/health probe failed on ${SERVICE_URL}." >&2
    exit 1
  fi

  READY_BODY="$(curl -fsS "${SERVICE_URL}/api/ready" || true)"
  if [[ "${READY_BODY}" != *'"status":"ready"'* || "${READY_BODY}" != *'"database":"connected"'* ]]; then
    echo "ERROR: Post-release /api/ready probe failed on ${SERVICE_URL}." >&2
    exit 1
  fi
fi

echo "Release Completed Successfully! Live Cloud Run Service URL: ${SERVICE_URL}"
