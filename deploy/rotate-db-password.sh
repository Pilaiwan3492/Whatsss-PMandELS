#!/usr/bin/env bash
# ==============================================================================
# deploy/rotate-db-password.sh — Hardened Manual Cloud SQL Password Rotation
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
