#!/usr/bin/env bash
# ==============================================================================
# deploy/deploy.sh — First-Time GCP Infrastructure Provisioning & Initial Deploy
# Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
# Issue #19 (Episode 5): R-03, R-04, R-07 (Least Privilege), Check C-04
#
# Usage:
#   # 1. Dry-run verification (prints all commands without mutating GCP):
#   DRY_RUN=1 GCP_PROJECT_ID="cpe334-whatsss-pmandels" bash deploy/deploy.sh
#
#   # 2. Live execution in GCP Cloud Shell:
#   GCP_PROJECT_ID="cpe334-whatsss-pmandels" bash deploy/deploy.sh
#
#   # 3. Explicit database password rotation:
#   ROTATE_DB_PASSWORD=1 GCP_PROJECT_ID="cpe334-whatsss-pmandels" bash deploy/deploy.sh
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Secure Temporary Workspace & Cleanup Trap
# ------------------------------------------------------------------------------
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'whatsss-deploy')"
cleanup() {
  if [[ -n "${TMP_DIR:-}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT INT TERM

DRY_RUN="${DRY_RUN:-0}"
ROTATE_DB_PASSWORD="${ROTATE_DB_PASSWORD:-0}"
if [[ "${ROTATE_DB_PASSWORD}" == "1" ]]; then
  echo "ERROR: Automatic in-place DB password rotation is disabled." >&2
  echo "Use the documented maintenance rotation procedure." >&2
  exit 1
fi
ROTATE_APP_SECRETS="${ROTATE_APP_SECRETS:-0}"
FORCE_IAM_BINDING="${FORCE_IAM_BINDING:-0}"

# ------------------------------------------------------------------------------
# Pre-Flight Dependency Verification
# ------------------------------------------------------------------------------
check_dependencies() {
  local missing=0
  for cmd in gcloud docker python3 git openssl; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      echo "ERROR: Required dependency '${cmd}' is not installed or not in PATH." >&2
      missing=1
    fi
  done

  if [[ "${missing}" -ne 0 ]]; then
    echo "Remediation: Install the missing CLI tools before running deploy/deploy.sh." >&2
    exit 1
  fi

  if ! python3 -c "import urllib.parse" >/dev/null 2>&1; then
    echo "ERROR: python3 is present but standard library 'urllib.parse' is unavailable." >&2
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# URL Encoding Helper (RFC 3986 Strict Encoding for Credentials)
# ------------------------------------------------------------------------------
url_encode() {
  python3 -c '
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=""), end="")
' "$1"
}

check_dependencies

# ------------------------------------------------------------------------------
# Explicit Project ID Validation (Never Silently Guess Project ID)
# ------------------------------------------------------------------------------
PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-${REGION:-asia-southeast1}}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: GCP_PROJECT_ID is required. Set GCP_PROJECT_ID=<your-project-id> explicitly to prevent deploying to an unintended project." >&2
  exit 1
fi

if [[ -n "${EXPECTED_PROJECT_ID:-}" && "${PROJECT_ID}" != "${EXPECTED_PROJECT_ID}" ]]; then
  echo "ERROR: GCP_PROJECT_ID ('${PROJECT_ID}') does not match EXPECTED_PROJECT_ID ('${EXPECTED_PROJECT_ID}')." >&2
  exit 1
fi

if [[ "${DRY_RUN}" != "1" ]]; then
  ACTIVE_GCLOUD_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
  if [[ -n "${ACTIVE_GCLOUD_PROJECT}" && "${ACTIVE_GCLOUD_PROJECT}" != "(unset)" && "${ACTIVE_GCLOUD_PROJECT}" != "${PROJECT_ID}" ]]; then
    if [[ "${CONFIRM_PROJECT:-0}" != "1" ]]; then
      echo "ERROR: Active gcloud project ('${ACTIVE_GCLOUD_PROJECT}') differs from target GCP_PROJECT_ID ('${PROJECT_ID}')." >&2
      echo "Remediation: Run 'gcloud config set project ${PROJECT_ID}' or pass CONFIRM_PROJECT=1." >&2
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
# Pre-Flight Security & Rotation Guard (P0)
# ------------------------------------------------------------------------------
ROTATE_DB_PASSWORD="${ROTATE_DB_PASSWORD:-0}"
if [[ "${ROTATE_DB_PASSWORD}" == "1" ]]; then
  echo "ERROR: Automatic in-place DB password rotation is disabled." >&2
  echo "Use the documented maintenance rotation procedure." >&2
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
SQL_DB_VERSION="${SQL_DB_VERSION:-POSTGRES_16}"
DB_NAME="${DB_NAME:-whatsss_db}"
DB_USER="${DB_USER:-whatsss_app}"

SECRET_DB_URL="${SECRET_DB_URL:-whatsss-database-url}"
SECRET_JWT="${SECRET_JWT:-whatsss-jwt-secret}"
SECRET_ADMIN_PWD="${SECRET_ADMIN_PWD:-whatsss-admin-password}"
SECRET_DEMO_PWD="${SECRET_DEMO_PWD:-whatsss-demo-password}"

MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-whatsss-migrate}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-whatsss}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

COMMIT_SHA="${APP_COMMIT_SHA:-$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)}"
if [[ "${DRY_RUN}" == "1" && -z "${COMMIT_SHA}" ]]; then
  COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
fi
if [[ -z "${COMMIT_SHA}" || ! "${COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: APP_COMMIT_SHA must be a full 40-character Git SHA." >&2
  exit 1
fi

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

has_project_role_binding() {
  local member="$1"
  local role="$2"
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 0
  fi
  local policy_json
  if ! policy_json="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json 2>/dev/null)"; then
    echo "ERROR: Unable to read project IAM policy." >&2
    exit 1
  fi
  python3 -c '
import sys, json
role = sys.argv[1]
member = sys.argv[2]
raw = sys.argv[3]
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
bindings = data.get("bindings", [])
for b in bindings:
    if b.get("role") == role and member in b.get("members", []):
        sys.exit(0)
sys.exit(1)
' "${role}" "${member}" "${policy_json}"
}

has_secret_role_binding() {
  local secret_name="$1"
  local member="$2"
  local role="$3"
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 0
  fi
  local secret_policy_json
  if ! secret_policy_json="$(gcloud secrets get-iam-policy "${secret_name}" --project="${PROJECT_ID}" --format=json 2>/dev/null)"; then
    echo "ERROR: Unable to read IAM policy for secret ${secret_name}." >&2
    exit 1
  fi
  python3 -c '
import sys, json
role = sys.argv[1]
member = sys.argv[2]
raw = sys.argv[3]
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
bindings = data.get("bindings", [])
for b in bindings:
    if b.get("role") == role and member in b.get("members", []):
        sys.exit(0)
sys.exit(1)
' "${role}" "${member}" "${secret_policy_json}"
}

verify_runtime_sa_project_iam() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 0
  fi
  local member="serviceAccount:${RUNTIME_SA_EMAIL}"
  local policy_json
  if ! policy_json="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json 2>/dev/null)"; then
    echo "ERROR: Unable to read project IAM policy." >&2
    exit 1
  fi

  local sa_roles
  sa_roles="$(python3 -c '
import sys, json
member = sys.argv[1]
raw = sys.argv[2]
try:
    data = json.loads(raw)
except Exception:
    sys.exit(2)
roles = [b.get("role") for b in data.get("bindings", []) if member in b.get("members", [])]
for r in sorted(roles):
    print(r)
' "${member}" "${policy_json}")" || {
    echo "ERROR: Failed to parse project IAM policy JSON." >&2
    exit 1
  }

  if [[ -z "${sa_roles}" ]]; then
    echo "ERROR: Verification failed — ${RUNTIME_SA_EMAIL} has no project-level roles on project ${PROJECT_ID}." >&2
    exit 1
  fi

  local has_cloudsql_client=0
  local unauthorized_roles=()
  while IFS= read -r role; do
    role="${role//$'\r'/}"
    [[ -z "${role}" ]] && continue
    if [[ "${role}" == "roles/cloudsql.client" ]]; then
      has_cloudsql_client=1
    else
      unauthorized_roles+=("${role}")
    fi
  done <<< "${sa_roles}"

  if [[ "${has_cloudsql_client}" -ne 1 ]]; then
    echo "ERROR: Verification failed — ${RUNTIME_SA_EMAIL} does not hold roles/cloudsql.client on project ${PROJECT_ID}." >&2
    exit 1
  fi

  if [[ "${#unauthorized_roles[@]}" -gt 0 ]]; then
    echo "ERROR: Least-privilege violation (R-07) — ${RUNTIME_SA_EMAIL} holds unauthorized project-level role(s): ${unauthorized_roles[*]}." >&2
    exit 1
  fi
}

verify_runtime_sa_secret_iam() {
  local secret_name="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 0
  fi
  local member="serviceAccount:${RUNTIME_SA_EMAIL}"
  local secret_policy_json
  if ! secret_policy_json="$(gcloud secrets get-iam-policy "${secret_name}" --project="${PROJECT_ID}" --format=json 2>/dev/null)"; then
    echo "ERROR: Unable to read IAM policy for secret ${secret_name}." >&2
    exit 1
  fi

  local sec_roles
  sec_roles="$(python3 -c '
import sys, json
member = sys.argv[1]
raw = sys.argv[2]
try:
    data = json.loads(raw)
except Exception:
    sys.exit(2)
roles = [b.get("role") for b in data.get("bindings", []) if member in b.get("members", [])]
for r in sorted(roles):
    print(r)
' "${member}" "${secret_policy_json}")" || {
    echo "ERROR: Failed to parse secret IAM policy JSON for ${secret_name}." >&2
    exit 1
  }

  if [[ -z "${sec_roles}" ]]; then
    echo "ERROR: Verification failed — ${RUNTIME_SA_EMAIL} has no IAM roles on secret ${secret_name}." >&2
    exit 1
  fi

  local has_accessor=0
  local unauthorized_sec_roles=()
  while IFS= read -r role; do
    role="${role//$'\r'/}"
    [[ -z "${role}" ]] && continue
    if [[ "${role}" == "roles/secretmanager.secretAccessor" ]]; then
      has_accessor=1
    else
      unauthorized_sec_roles+=("${role}")
    fi
  done <<< "${sec_roles}"

  if [[ "${has_accessor}" -ne 1 ]]; then
    echo "ERROR: Verification failed — ${RUNTIME_SA_EMAIL} does not hold roles/secretmanager.secretAccessor on secret ${secret_name}." >&2
    exit 1
  fi

  if [[ "${#unauthorized_sec_roles[@]}" -gt 0 ]]; then
    echo "ERROR: Least-privilege violation (R-07) — ${RUNTIME_SA_EMAIL} holds unauthorized role(s) on secret ${secret_name}: ${unauthorized_sec_roles[*]}." >&2
    exit 1
  fi
}

ensure_secret_exists_with_value() {
  local secret_name="$1"
  local secret_value="$2"
  local rotate_flag="${3:-0}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[DRY-RUN] ensure Secret Manager secret: ${secret_name} (value redacted)"
    return 0
  fi

  local secret_file="${TMP_DIR}/secret_${secret_name}.txt"
  umask 077
  printf '%s' "${secret_value}" > "${secret_file}"

  if ! gcloud secrets describe "${secret_name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    if ! gcloud secrets create "${secret_name}" \
      --project="${PROJECT_ID}" \
      --replication-policy="automatic" \
      --data-file="${secret_file}" >/dev/null; then
      rm -f "${secret_file}"
      echo "ERROR: Failed to create secret ${secret_name} in Secret Manager." >&2
      exit 1
    fi
  elif [[ "${rotate_flag}" == "1" ]]; then
    if ! gcloud secrets versions add "${secret_name}" \
      --project="${PROJECT_ID}" \
      --data-file="${secret_file}" >/dev/null; then
      rm -f "${secret_file}"
      echo "ERROR: Failed to add new secret version for ${secret_name}." >&2
      exit 1
    fi
  else
    echo "Secret ${secret_name} already exists; preserving existing version."
  fi

  rm -f "${secret_file}"
}

verify_enabled_secret_version() {
  local secret_name="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "1"
    return 0
  fi

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
  echo "${version_name##*/}"
}

echo "=============================================================================="
echo " Whatsss GCP Deployment (DRY_RUN=${DRY_RUN})"
echo " Project ID : ${PROJECT_ID}"
echo " Region     : ${REGION}"
echo " Runtime SA : ${RUNTIME_SA_EMAIL}"
echo " Cloud SQL  : ${CLOUDSQL_CONNECTION_NAME} (${SQL_DB_VERSION}, ${SQL_EDITION}, ${SQL_TIER})"
echo " Image URI  : ${IMAGE_URI}"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# Step 1: Enable Required GCP APIs
# ------------------------------------------------------------------------------
echo "--> [1/7] Enabling required GCP APIs..."
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
echo "--> [2/7] Provisioning runtime service account (${RUNTIME_SA_NAME}) with least privilege..."
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
    --display-name="Whatsss Cloud Run Runtime Service Account" \
    --project="${PROJECT_ID}"
  run_cmd gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/cloudsql.client" \
    --condition=None
else
  if ! gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
      --display-name="Whatsss Cloud Run Runtime Service Account" \
      --project="${PROJECT_ID}"
  fi

  # Pre-check existing IAM policy before attempting mutation; fail fast if binding fails
  if [[ "${FORCE_IAM_BINDING}" == "1" ]] || ! has_project_role_binding "serviceAccount:${RUNTIME_SA_EMAIL}" "roles/cloudsql.client"; then
    if ! gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
      --role="roles/cloudsql.client" \
      --condition=None >/dev/null; then
      echo "ERROR: Failed to grant Cloud SQL Client to Runtime SA (${RUNTIME_SA_EMAIL})." >&2
      echo "Remediation: Run with an account holding roles/resourcemanager.projectIamAdmin or roles/owner." >&2
      exit 1
    fi
  else
    echo "IAM binding roles/cloudsql.client already present for ${RUNTIME_SA_EMAIL}."
  fi

  verify_runtime_sa_project_iam
fi

# ------------------------------------------------------------------------------
# Step 3: Create Artifact Registry Repository
# ------------------------------------------------------------------------------
echo "--> [3/7] Ensuring Artifact Registry repository (${AR_REPO})..."
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
echo "--> [4/7] Ensuring Cloud SQL PostgreSQL 16 instance (${SQL_INSTANCE})..."
if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud sql instances create "${SQL_INSTANCE}" \
    --database-version="${SQL_DB_VERSION}" \
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
      --database-version="${SQL_DB_VERSION}" \
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
echo "--> [4b/7] Enforcing mandatory Cloud SQL credit protection (--no-storage-auto-increase)..."
run_cmd gcloud sql instances patch "${SQL_INSTANCE}" \
  --no-storage-auto-increase \
  --project="${PROJECT_ID}"

if [[ "${DRY_RUN}" == "1" ]]; then
  run_cmd gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}"
else
  if ! gcloud sql databases describe "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    run_cmd gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}"
  fi
fi

# ------------------------------------------------------------------------------
# Step 5: Idempotent DB User & Secret Manager Provisioning + Least-Privilege IAM
# ------------------------------------------------------------------------------
echo "--> [5/7] Ensuring synchronized Cloud SQL user & Secret Manager secrets..."
if [[ "${DRY_RUN}" == "1" ]]; then
  DRY_DB_PWD="${WHATSSS_DB_PASSWORD:-DryRunPass123}"
  DB_USER_ENCODED="$(url_encode "${DB_USER}")"
  DB_PASSWORD_ENCODED="$(url_encode "${DRY_DB_PWD}")"
  DATABASE_URL_VALUE="postgresql://${DB_USER_ENCODED}:${DB_PASSWORD_ENCODED}@localhost:5432/${DB_NAME}?host=/cloudsql/${CLOUDSQL_CONNECTION_NAME}&schema=public"
  unset DRY_DB_PWD DB_PASSWORD_ENCODED DATABASE_URL_VALUE

  echo "[DRY-RUN] gcloud sql users create/preserve ${DB_USER} --instance=${SQL_INSTANCE} (password redacted)"
  for sec in "${SECRET_DB_URL}" "${SECRET_JWT}" "${SECRET_ADMIN_PWD}" "${SECRET_DEMO_PWD}"; do
    echo "[DRY-RUN] ensure Secret Manager secret: ${sec} (value redacted)"
    run_cmd gcloud secrets add-iam-policy-binding "${sec}" \
      --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="${PROJECT_ID}"
  done
  DB_URL_VERSION="latest"
  JWT_VERSION="latest"
  ADMIN_PWD_VERSION="latest"
  DEMO_PWD_VERSION="latest"
else
  USER_EXISTS=0
  if gcloud sql users list --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" --format="value(name)" | grep -qx "${DB_USER}"; then
    USER_EXISTS=1
  fi

  DB_SECRET_EXISTS=0
  if gcloud secrets describe "${SECRET_DB_URL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    DB_SECRET_EXISTS=1
  fi

  if [[ "${USER_EXISTS}" == "1" && "${DB_SECRET_EXISTS}" == "1" ]]; then
    echo "Database user ${DB_USER} and secret ${SECRET_DB_URL} already exist; preserving synchronized credentials."
  else
    echo "Provisioning initial database user ${DB_USER} and synchronizing ${SECRET_DB_URL}..."
    DB_PASSWORD="${WHATSSS_DB_PASSWORD:-$(openssl rand -hex 16)}"
    if [[ "${USER_EXISTS}" == "0" ]]; then
      if ! gcloud sql users create "${DB_USER}" \
        --instance="${SQL_INSTANCE}" \
        --password="${DB_PASSWORD}" \
        --project="${PROJECT_ID}" >/dev/null; then
        echo "ERROR: Failed to create Cloud SQL user ${DB_USER}." >&2
        exit 1
      fi
    else
      if ! gcloud sql users set-password "${DB_USER}" \
        --instance="${SQL_INSTANCE}" \
        --password="${DB_PASSWORD}" \
        --project="${PROJECT_ID}" >/dev/null; then
        echo "ERROR: Failed to synchronize Cloud SQL password for ${DB_USER}." >&2
        exit 1
      fi
    fi

    DB_USER_ENCODED="$(url_encode "${DB_USER}")"
    DB_PASSWORD_ENCODED="$(url_encode "${DB_PASSWORD}")"
    DATABASE_URL_VALUE="postgresql://${DB_USER_ENCODED}:${DB_PASSWORD_ENCODED}@localhost:5432/${DB_NAME}?host=/cloudsql/${CLOUDSQL_CONNECTION_NAME}&schema=public"
    ensure_secret_exists_with_value "${SECRET_DB_URL}" "${DATABASE_URL_VALUE}" "0"
    unset DB_PASSWORD DB_PASSWORD_ENCODED DATABASE_URL_VALUE
  fi

  JWT_SECRET_VALUE="${WHATSSS_JWT_SECRET:-$(openssl rand -hex 32)}"
  ADMIN_PWD_VALUE="${WHATSSS_ADMIN_PASSWORD:-Admin_$(openssl rand -hex 12)!}"
  DEMO_PWD_VALUE="${WHATSSS_DEMO_PASSWORD:-Demo_$(openssl rand -hex 12)!}"

  ensure_secret_exists_with_value "${SECRET_JWT}" "${JWT_SECRET_VALUE}" "${ROTATE_APP_SECRETS:-0}"
  ensure_secret_exists_with_value "${SECRET_ADMIN_PWD}" "${ADMIN_PWD_VALUE}" "${ROTATE_APP_SECRETS:-0}"
  ensure_secret_exists_with_value "${SECRET_DEMO_PWD}" "${DEMO_PWD_VALUE}" "${ROTATE_APP_SECRETS:-0}"
  unset JWT_SECRET_VALUE ADMIN_PWD_VALUE DEMO_PWD_VALUE

  DB_URL_VERSION="$(verify_enabled_secret_version "${SECRET_DB_URL}")"
  JWT_VERSION="$(verify_enabled_secret_version "${SECRET_JWT}")"
  ADMIN_PWD_VERSION="$(verify_enabled_secret_version "${SECRET_ADMIN_PWD}")"
  DEMO_PWD_VERSION="$(verify_enabled_secret_version "${SECRET_DEMO_PWD}")"

  for sec in \
    "${SECRET_DB_URL}" \
    "${SECRET_JWT}" \
    "${SECRET_ADMIN_PWD}" \
    "${SECRET_DEMO_PWD}"; do

    if [[ "${FORCE_IAM_BINDING:-0}" == "1" ]] || ! has_secret_role_binding "${sec}" "serviceAccount:${RUNTIME_SA_EMAIL}" "roles/secretmanager.secretAccessor"; then
      if ! gcloud secrets add-iam-policy-binding "${sec}" \
        --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
        --role="roles/secretmanager.secretAccessor" \
        --project="${PROJECT_ID}" >/dev/null; then
        echo "ERROR: Failed to grant Secret Accessor for ${sec}." >&2
        exit 1
      fi
    else
      echo "Secret Accessor binding already present on ${sec} for ${RUNTIME_SA_EMAIL}."
    fi

    verify_runtime_sa_secret_iam "${sec}"
  done
fi

# ------------------------------------------------------------------------------
# Step 6: Build & Push Production Docker Image to Artifact Registry
# ------------------------------------------------------------------------------
echo "--> [6/7] Building and pushing Docker image (${IMAGE_URI})..."
run_cmd gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run_cmd docker build \
  --build-arg VITE_API_BASE_URL=/api \
  --build-arg APP_COMMIT_SHA="${COMMIT_SHA}" \
  -t "${IMAGE_URI}" .
run_cmd docker push "${IMAGE_URI}"

if [[ "${DRY_RUN}" == "1" ]]; then
  IMAGE_DIGEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${APP_NAME}@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781"
else
  IMAGE_DIGEST="$(gcloud artifacts docker images describe "${IMAGE_URI}" --format='value(image_summary.fully_qualified_digest)')"
  if [[ -z "${IMAGE_DIGEST}" || ! "${IMAGE_DIGEST}" =~ @sha256:[0-9a-f]{64}$ ]]; then
    echo "ERROR: Failed to resolve pushed Docker image digest for ${IMAGE_URI}." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Step 7: Delegate Migration Job + Cloud Run Service Rollout to deploy/release.sh
# ------------------------------------------------------------------------------
echo "--> [7/7] Invoking deploy/release.sh for migration job, seed, and Cloud Run deployment..."
DRY_RUN="${DRY_RUN}" \
GCP_PROJECT_ID="${PROJECT_ID}" \
GCP_REGION="${REGION}" \
IMAGE_REF="${IMAGE_DIGEST}" \
APP_COMMIT_SHA="${COMMIT_SHA}" \
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL}" \
CLOUDSQL_CONNECTION_NAME="${CLOUDSQL_CONNECTION_NAME}" \
SECRET_DB_URL="${SECRET_DB_URL}" \
SECRET_DB_URL_VERSION="${DB_URL_VERSION}" \
SECRET_JWT="${SECRET_JWT}" \
SECRET_JWT_VERSION="${JWT_VERSION}" \
SECRET_ADMIN_PWD="${SECRET_ADMIN_PWD}" \
SECRET_ADMIN_PWD_VERSION="${ADMIN_PWD_VERSION}" \
SECRET_DEMO_PWD="${SECRET_DEMO_PWD}" \
SECRET_DEMO_PWD_VERSION="${DEMO_PWD_VERSION}" \
MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME}" \
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE}" \
SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}" \
bash "$(dirname "$0")/release.sh"

echo "=============================================================================="
echo " Whatsss GCP Deployment Completed Successfully!"
echo "=============================================================================="
