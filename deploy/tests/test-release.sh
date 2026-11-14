#!/usr/bin/env bash
# ==============================================================================
# deploy/tests/test-release.sh — Automated Unit & Contract Tests for release.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
RELEASE_SCRIPT="${DEPLOY_DIR}/release.sh"
MOCKS_DIR="${SCRIPT_DIR}/mocks"

cd "${REPO_ROOT}"

chmod +x "${RELEASE_SCRIPT}" "${MOCKS_DIR}/gcloud" "${MOCKS_DIR}/docker" "${MOCKS_DIR}/curl"

TEST_ROOT="$(mktemp -d 2>/dev/null || mktemp -d -t 'whatsss-test-release')"
cleanup() {
  if [[ -n "${TEST_ROOT:-}" && -d "${TEST_ROOT}" ]]; then
    rm -rf "${TEST_ROOT}"
  fi
}
trap cleanup EXIT INT TERM

export PATH="${MOCKS_DIR}:${PATH}"

PASS_COUNT=0
fail_test() {
  echo "FAIL: $1" >&2
  exit 1
}
pass_test() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS [${PASS_COUNT}]: $1"
}

new_test_env() {
  local name="$1"
  MOCK_STATE_DIR="${TEST_ROOT}/${name}/state"
  MOCK_LOG_FILE="${TEST_ROOT}/${name}/commands.log"
  mkdir -p "${MOCK_STATE_DIR}"
  : > "${MOCK_LOG_FILE}"
  export MOCK_STATE_DIR MOCK_LOG_FILE
}

echo "=============================================================================="
echo " Running Automated Test Suite: deploy/tests/test-release.sh"
echo "=============================================================================="

VALID_COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
VALID_IMAGE_REF="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781"

# Standard valid secret versions required by release contract
export DB_URL_VERSION="1"
export JWT_SECRET_VERSION="1"
export ADMIN_PASSWORD_VERSION="1"
export DEMO_PASSWORD_VERSION="1"

# ------------------------------------------------------------------------------
# Test 1: Missing GCP_PROJECT_ID fails fast
# ------------------------------------------------------------------------------
new_test_env "rel1_missing_project"
if output="$(GCP_PROJECT_ID="" PROJECT_ID="" APP_COMMIT_SHA="${VALID_COMMIT_SHA}" IMAGE_REF="${VALID_IMAGE_REF}" bash "${RELEASE_SCRIPT}" 2>&1)"; then
  fail_test "Expected release.sh to fail when GCP_PROJECT_ID is missing"
fi
if [[ "${output}" != *"ERROR: GCP_PROJECT_ID is required"* ]]; then
  fail_test "Expected explicit GCP_PROJECT_ID error, got: ${output}"
fi
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "Expected zero gcloud commands when GCP_PROJECT_ID is missing"
fi
pass_test "Missing GCP_PROJECT_ID fails fast with zero GCP calls"

# ------------------------------------------------------------------------------
# Test 2: Missing or Invalid APP_COMMIT_SHA Fails Fast (Full 40-char SHA Required)
# ------------------------------------------------------------------------------
new_test_env "rel2_missing_sha"
if output="$(GCP_PROJECT_ID="cpe334-whatsss-pmandels" APP_COMMIT_SHA="" IMAGE_REF="${VALID_IMAGE_REF}" bash "${RELEASE_SCRIPT}" 2>&1)"; then
  fail_test "Expected release.sh to fail when APP_COMMIT_SHA is missing"
fi
if [[ "${output}" != *"ERROR: APP_COMMIT_SHA is required."* ]]; then
  fail_test "Expected APP_COMMIT_SHA required error, got: ${output}"
fi

new_test_env "rel2_invalid_sha"
if output="$(GCP_PROJECT_ID="cpe334-whatsss-pmandels" APP_COMMIT_SHA="short_or_production_tag" IMAGE_REF="${VALID_IMAGE_REF}" bash "${RELEASE_SCRIPT}" 2>&1)"; then
  fail_test "Expected release.sh to fail when APP_COMMIT_SHA is not 40-character hex"
fi
if [[ "${output}" != *"ERROR: APP_COMMIT_SHA must be a full 40-character Git SHA."* ]]; then
  fail_test "Expected 40-character Git SHA error, got: ${output}"
fi
pass_test "Missing or non-40-char APP_COMMIT_SHA fails fast and prevents unverified releases"

# ------------------------------------------------------------------------------
# Test 3: Missing or Tag-Based IMAGE_REF Fails Fast (Immutable Digest Required)
# ------------------------------------------------------------------------------
new_test_env "rel3_missing_image"
if output="$(GCP_PROJECT_ID="cpe334-whatsss-pmandels" APP_COMMIT_SHA="${VALID_COMMIT_SHA}" IMAGE_REF="" bash "${RELEASE_SCRIPT}" 2>&1)"; then
  fail_test "Expected release.sh to fail when IMAGE_REF is missing"
fi
if [[ "${output}" != *"ERROR: IMAGE_REF is required."* ]]; then
  fail_test "Expected IMAGE_REF required error, got: ${output}"
fi

new_test_env "rel3_tag_image"
if output="$(GCP_PROJECT_ID="cpe334-whatsss-pmandels" APP_COMMIT_SHA="${VALID_COMMIT_SHA}" IMAGE_REF="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss:latest" bash "${RELEASE_SCRIPT}" 2>&1)"; then
  fail_test "Expected release.sh to fail when IMAGE_REF is an image tag instead of immutable digest"
fi
if [[ "${output}" != *"ERROR: IMAGE_REF must use an immutable sha256 digest."* ]]; then
  fail_test "Expected immutable sha256 digest error, got: ${output}"
fi
pass_test "Missing or tag-based IMAGE_REF fails fast and enforces immutable sha256 digest"

# ------------------------------------------------------------------------------
# Test 4: Enforce Explicit Secret Versions & Forbid Automatic Selection
# ------------------------------------------------------------------------------
# 4a: Missing DB_URL_VERSION
new_test_env "rel4_missing_db_url_ver"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  DB_URL_VERSION="" \
  SECRET_DB_URL_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when DB_URL_VERSION is missing"
fi
if [[ "${output}" != *"DB_URL_VERSION is required"* || "${output}" != *"Automatic secret version selection"* ]]; then
  fail_test "Expected DB_URL_VERSION required error, got: ${output}"
fi

# 4b: Missing JWT_SECRET_VERSION
new_test_env "rel4_missing_jwt_ver"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  JWT_SECRET_VERSION="" \
  SECRET_JWT_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when JWT_SECRET_VERSION is missing"
fi
if [[ "${output}" != *"JWT_SECRET_VERSION is required"* ]]; then
  fail_test "Expected JWT_SECRET_VERSION required error, got: ${output}"
fi

# 4c: Missing ADMIN_PASSWORD_VERSION
new_test_env "rel4_missing_admin_ver"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  ADMIN_PASSWORD_VERSION="" \
  SECRET_ADMIN_PWD_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when ADMIN_PASSWORD_VERSION is missing"
fi
if [[ "${output}" != *"ADMIN_PASSWORD_VERSION is required"* ]]; then
  fail_test "Expected ADMIN_PASSWORD_VERSION required error, got: ${output}"
fi

# 4d: Missing DEMO_PASSWORD_VERSION
new_test_env "rel4_missing_demo_ver"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  DEMO_PASSWORD_VERSION="" \
  SECRET_DEMO_PWD_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when DEMO_PASSWORD_VERSION is missing"
fi
if [[ "${output}" != *"DEMO_PASSWORD_VERSION is required"* ]]; then
  fail_test "Expected DEMO_PASSWORD_VERSION required error, got: ${output}"
fi

# 4e: Non-numeric secret version rejected
new_test_env "rel4_non_numeric_ver"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  DB_URL_VERSION="latest" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to reject non-numeric secret version 'latest'"
fi
if [[ "${output}" != *"must be a numeric version"* ]]; then
  fail_test "Expected numeric version error message, got: ${output}"
fi

# 4f: Disabled secret version fails fast
new_test_env "rel4_secret_disabled"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_SECRET_VERSION_DISABLED=1 \
  DB_URL_VERSION="2" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when secret version is not ENABLED"
fi
if [[ "${output}" != *"is missing or not ENABLED"* ]]; then
  fail_test "Expected secret version ENABLED check error, got: ${output}"
fi
pass_test "Explicit numeric Secret Manager versions enforced across all 4 secrets and verified in ENABLED state"

# ------------------------------------------------------------------------------
# Test 5: DRY_RUN=1 executes zero real gcloud/curl commands
# ------------------------------------------------------------------------------
new_test_env "rel5_dry_run"
output="$(
  DRY_RUN=1 \
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "DRY_RUN=1 must not execute real/mocked gcloud or curl commands"
fi
if [[ "${output}" != *"[DRY-RUN] gcloud run jobs deploy whatsss-migrate"* || "${output}" != *"[DRY-RUN] gcloud run deploy whatsss"* ]]; then
  fail_test "DRY_RUN=1 output missing expected [DRY-RUN] commands"
fi
pass_test "DRY_RUN=1 performs zero GCP mutations and prints expected release rollout commands"

# ------------------------------------------------------------------------------
# Test 6: First-Time Release (No Existing Service) Uses Safe Bootstrap & Real URL
# ------------------------------------------------------------------------------
new_test_env "rel6_first_deploy"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
initial_client_url="$(cat "${MOCK_STATE_DIR}/svc_initial_client_url_whatsss")"
final_client_url="$(cat "${MOCK_STATE_DIR}/svc_client_url_whatsss")"

if [[ "${initial_client_url}" != "https://bootstrap-pending.invalid" ]]; then
  fail_test "First deploy should use safe https://bootstrap-pending.invalid before reading real Cloud Run URL, got '${initial_client_url}'"
fi
if [[ "${final_client_url}" != "https://whatsss-sipqw4logq-as.a.run.app" ]]; then
  fail_test "Final CLIENT_URL was not synchronized to real Cloud Run URL: '${final_client_url}'"
fi
if [[ "${output}" != *"Migration & seed job execution verified: whatsss-migrate-exec01 (status: SUCCEEDED)"* ]]; then
  fail_test "Expected migration execution ID verification in output"
fi
if [[ "${output}" != *"Release Completed Successfully! Live Cloud Run Service URL: https://whatsss-sipqw4logq-as.a.run.app"* ]]; then
  fail_test "Expected Release Completed Successfully message"
fi
pass_test "First-time release uses safe bootstrap placeholder, synchronizes real Cloud Run HTTPS URL, and verifies probes"

# ------------------------------------------------------------------------------
# Test 7: Subsequent Release (Existing Service) Uses Existing Real HTTPS URL
# ------------------------------------------------------------------------------
: > "${MOCK_LOG_FILE}"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
subsequent_initial_url="$(cat "${MOCK_STATE_DIR}/svc_initial_client_url_whatsss")"
if [[ "${subsequent_initial_url}" != "https://whatsss-sipqw4logq-as.a.run.app" ]]; then
  fail_test "Subsequent deploy should preserve existing Cloud Run HTTPS URL during deploy, got '${subsequent_initial_url}'"
fi
if [[ "${output}" != *"Release Completed Successfully!"* ]]; then
  fail_test "Subsequent deploy did not report Release Completed Successfully!"
fi
pass_test "Subsequent release preserves existing real Cloud Run HTTPS URL and verifies post-update state"

# ------------------------------------------------------------------------------
# Test 8: Migration Job Failure Aborts Before Deploying Cloud Run Service
# ------------------------------------------------------------------------------
new_test_env "rel8_migrate_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_FAIL_MIGRATE_EXECUTE=1 \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when migration job execution fails"
fi
if [[ "${output}" != *"ERROR: Migration job failed. Service deployment aborted."* ]]; then
  fail_test "Expected migration failure error message, got: ${output}"
fi
if grep -q "gcloud run deploy" "${MOCK_LOG_FILE}"; then
  fail_test "gcloud run deploy must NOT be called when migration job fails"
fi
pass_test "Migration job failure immediately aborts release without deploying Cloud Run service"

# ------------------------------------------------------------------------------
# Test 9: Migration Job Execution Reporting succeededCount=0 Aborts Release
# ------------------------------------------------------------------------------
new_test_env "rel9_migrate_zero_succeeded"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_MIGRATE_SUCCEEDED_COUNT=0 \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when migration execution succeededCount is 0"
fi
if [[ "${output}" != *"did not report succeeded status"* ]]; then
  fail_test "Expected succeededCount verification error message, got: ${output}"
fi
if grep -q "gcloud run deploy" "${MOCK_LOG_FILE}"; then
  fail_test "gcloud run deploy must NOT be called when migration execution succeededCount is 0"
fi
pass_test "Migration execution status verification rejects succeededCount=0 before service rollout"

# ------------------------------------------------------------------------------
# Test 10: Empty Cloud Run Service URL Aborts Release
# ------------------------------------------------------------------------------
new_test_env "rel10_empty_url"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_SERVICE_URL="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when Cloud Run Service URL is empty"
fi
if [[ "${output}" == *"Release Completed Successfully"* ]]; then
  fail_test "Must not report Release Completed Successfully when Service URL is empty"
fi
pass_test "Empty Cloud Run Service URL aborts release and prevents false success report"

# ------------------------------------------------------------------------------
# Test 11: Non-HTTPS Cloud Run Service URL Aborts Release
# ------------------------------------------------------------------------------
new_test_env "rel11_non_https_url"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_SERVICE_URL="http://whatsss-insecure.asia-southeast1.run.app" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when Cloud Run Service URL is not https://"
fi
if [[ "${output}" != *"ERROR: Invalid Cloud Run Service URL"* ]]; then
  fail_test "Expected Invalid Cloud Run Service URL error, got: ${output}"
fi
pass_test "Non-HTTPS Cloud Run Service URL is rejected"

# ------------------------------------------------------------------------------
# Test 12: CLIENT_URL Update Failure Aborts Release
# ------------------------------------------------------------------------------
new_test_env "rel12_update_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_FAIL_SERVICE_UPDATE=1 \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when CLIENT_URL update fails"
fi
if [[ "${output}" == *"Release Completed Successfully"* ]]; then
  fail_test "Must not report Release Completed Successfully when CLIENT_URL update fails"
fi
pass_test "CLIENT_URL update failure aborts release before completion"

# ------------------------------------------------------------------------------
# Test 13: Post-Update CLIENT_URL Verification Detects Stale Value
# ------------------------------------------------------------------------------
new_test_env "rel13_stale_client_url"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_STALE_CLIENT_URL=1 \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when post-update CLIENT_URL verification does not match SERVICE_URL"
fi
if [[ "${output}" != *"ERROR: Post-update CLIENT_URL verification failed"* ]]; then
  fail_test "Expected post-update CLIENT_URL verification error, got: ${output}"
fi
pass_test "Post-update CLIENT_URL verification catches mismatched environment configuration"

# ------------------------------------------------------------------------------
# Test 14: Runtime Service Account Verification on Job and Service
# ------------------------------------------------------------------------------
new_test_env "rel14_job_sa_mismatch"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_JOB_SA="1086708130644-compute@developer.gserviceaccount.com" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when Migration Job uses Default Compute SA"
fi
if [[ "${output}" != *"ERROR: Migration job service account mismatch"* ]]; then
  fail_test "Expected migration job SA mismatch error, got: ${output}"
fi

new_test_env "rel14_service_sa_mismatch"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  MOCK_SERVICE_SA="1086708130644-compute@developer.gserviceaccount.com" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when Cloud Run Service uses Default Compute SA"
fi
if [[ "${output}" != *"ERROR: Cloud Run service account mismatch"* ]]; then
  fail_test "Expected Cloud Run service SA mismatch error, got: ${output}"
fi
pass_test "Runtime SA verification rejects Default Compute SA on both Migration Job and Cloud Run Service"

# ------------------------------------------------------------------------------
# Test 15: SKIP_MIGRATIONS=true skips migration job deploy & execute but deploys service
# ------------------------------------------------------------------------------
new_test_env "rel15_skip_migrations_true"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if [[ "${output}" != *"SKIP_MIGRATIONS=true — skipping Migration Job"* ]]; then
  fail_test "Expected SKIP_MIGRATIONS skip message, got: ${output}"
fi
if grep -q "gcloud run jobs deploy" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run jobs deploy' NOT to be called when SKIP_MIGRATIONS=true"
fi
if grep -q "gcloud run jobs execute" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run jobs execute' NOT to be called when SKIP_MIGRATIONS=true"
fi
if ! grep -q "gcloud run deploy whatsss" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run deploy whatsss' to be called when SKIP_MIGRATIONS=true"
fi
pass_test "SKIP_MIGRATIONS=true skips Migration Job deploy and execute while completing Service deploy"

# ------------------------------------------------------------------------------
# Test 16: SKIP_MIGRATIONS=false explicitly executes migration job normally
# ------------------------------------------------------------------------------
new_test_env "rel16_skip_migrations_false"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="false" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if ! grep -q "gcloud run jobs deploy" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run jobs deploy' to be called when SKIP_MIGRATIONS=false"
fi
if ! grep -q "gcloud run jobs execute" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run jobs execute' to be called when SKIP_MIGRATIONS=false"
fi
pass_test "SKIP_MIGRATIONS=false explicitly configures and executes Migration Job"

# ------------------------------------------------------------------------------
# Test 17: SKIP_MIGRATIONS with invalid value fails fast
# ------------------------------------------------------------------------------
new_test_env "rel17_skip_migrations_invalid"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="not_a_boolean" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail on invalid SKIP_MIGRATIONS value"
fi
if [[ "${output}" != *"ERROR: SKIP_MIGRATIONS must be 'true' or 'false'"* ]]; then
  fail_test "Expected SKIP_MIGRATIONS validation error, got: ${output}"
fi
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "Expected zero gcloud commands when SKIP_MIGRATIONS validation fails"
fi
pass_test "Invalid SKIP_MIGRATIONS value fails fast before any GCP mutation"

# ------------------------------------------------------------------------------
# Test 18: Normal migration failure (SKIP_MIGRATIONS=false) still aborts release
# ------------------------------------------------------------------------------
new_test_env "rel18_migration_failure_aborts"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="false" \
  MOCK_FAIL_MIGRATE_EXECUTE=1 \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail when Migration Job execution fails"
fi
if grep -q "gcloud run deploy whatsss" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run deploy whatsss' NOT to be called when migration fails"
fi
pass_test "Migration failure with SKIP_MIGRATIONS=false reliably blocks service deployment"

# ------------------------------------------------------------------------------
# Test 19: SKIP_MIGRATIONS=true verifies service probes [4/4]
# ------------------------------------------------------------------------------
new_test_env "rel19_skip_migrations_probes"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if [[ "${output}" != *"[4/4] Verifying live health and readiness probes"* ]]; then
  fail_test "Expected probe verification to run when SKIP_MIGRATIONS=true, got: ${output}"
fi
pass_test "SKIP_MIGRATIONS=true preserves end-to-end service probe verification"

# ------------------------------------------------------------------------------
# Test 20: SKIP_MIGRATIONS=true verifies and synchronizes CLIENT_URL [3/4]
# ------------------------------------------------------------------------------
new_test_env "rel20_skip_migrations_client_url"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if [[ "${output}" != *"[3/4] Resolving live Cloud Run HTTPS URL and synchronizing CLIENT_URL"* ]]; then
  fail_test "Expected CLIENT_URL sync to run when SKIP_MIGRATIONS=true, got: ${output}"
fi
pass_test "SKIP_MIGRATIONS=true preserves CLIENT_URL synchronization and verification"

# ------------------------------------------------------------------------------
# Test 21: Rollback does not require migration/seed-only secrets
# ------------------------------------------------------------------------------
new_test_env "rel21_rollback_omits_seed_secrets"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  DB_URL_VERSION="1" \
  JWT_SECRET_VERSION="1" \
  ADMIN_PASSWORD_VERSION="" \
  DEMO_PASSWORD_VERSION="" \
  SECRET_ADMIN_PWD_VERSION="" \
  SECRET_DEMO_PWD_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"
if ! grep -q "gcloud run deploy whatsss" "${MOCK_LOG_FILE}"; then
  fail_test "Expected 'gcloud run deploy whatsss' to be called during rollback without seed secrets"
fi
pass_test "Rollback succeeds without requiring migration or seed secrets"

# ------------------------------------------------------------------------------
# Test 22: Rollback still enforces required service secrets (DB_URL and JWT_SECRET)
# ------------------------------------------------------------------------------
new_test_env "rel22_rollback_requires_service_secrets"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  DB_URL_VERSION="" \
  SECRET_DB_URL_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail during rollback when DB_URL_VERSION is missing"
fi
if [[ "${output}" != *"ERROR: DB_URL_VERSION is required"* ]]; then
  fail_test "Expected DB_URL_VERSION required error during rollback, got: ${output}"
fi

new_test_env "rel22_rollback_requires_jwt_secret"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="true" \
  JWT_SECRET_VERSION="" \
  SECRET_JWT_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail during rollback when JWT_SECRET_VERSION is missing"
fi
if [[ "${output}" != *"ERROR: JWT_SECRET_VERSION is required"* ]]; then
  fail_test "Expected JWT_SECRET_VERSION required error during rollback, got: ${output}"
fi
pass_test "Rollback strictly enforces required Cloud Run Service secrets (DB_URL and JWT_SECRET)"

# ------------------------------------------------------------------------------
# Test 23: Normal deployment requires all 4 secrets including seed secrets
# ------------------------------------------------------------------------------
new_test_env "rel23_normal_deploy_requires_admin_pwd"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="${VALID_COMMIT_SHA}" \
  IMAGE_REF="${VALID_IMAGE_REF}" \
  SKIP_MIGRATIONS="false" \
  ADMIN_PASSWORD_VERSION="" \
  SECRET_ADMIN_PWD_VERSION="" \
  bash "${RELEASE_SCRIPT}" 2>&1
)"; then
  fail_test "Expected release.sh to fail in normal deploy when ADMIN_PASSWORD_VERSION is missing"
fi
if [[ "${output}" != *"ERROR: ADMIN_PASSWORD_VERSION is required"* ]]; then
  fail_test "Expected ADMIN_PASSWORD_VERSION required error, got: ${output}"
fi
pass_test "Normal deployment strictly requires migration and seed secrets"

echo "=============================================================================="
echo " ALL ${PASS_COUNT} RELEASE SCRIPT TESTS PASSED!"
echo "=============================================================================="
