#!/usr/bin/env bash
# ==============================================================================
# deploy/tests/test-deploy.sh — Automated Unit & Integration Tests for deploy.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_SCRIPT="${DEPLOY_DIR}/deploy.sh"
MOCKS_DIR="${SCRIPT_DIR}/mocks"

chmod +x "${DEPLOY_SCRIPT}" "${DEPLOY_DIR}/release.sh" "${MOCKS_DIR}/gcloud" "${MOCKS_DIR}/docker" "${MOCKS_DIR}/curl"

TEST_ROOT="$(mktemp -d 2>/dev/null || mktemp -d -t 'whatsss-test-deploy')"
cleanup() {
  if [[ -n "${TEST_ROOT:-}" && -d "${TEST_ROOT}" ]]; then
    rm -rf "${TEST_ROOT}"
  fi
}
trap cleanup EXIT INT TERM

# Ensure python3 is available in PATH (on Windows Git Bash where python3 may be in ~/.local/bin)
if ! python3 -c "import urllib.parse" >/dev/null 2>&1; then
  if [[ -x "${HOME}/.local/bin/python3.exe" ]]; then
    export PATH="${HOME}/.local/bin:${PATH}"
  elif [[ -x "/c/Users/User/.local/bin/python3.exe" ]]; then
    export PATH="/c/Users/User/.local/bin:${PATH}"
  fi
fi

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
echo " Running Automated Test Suite: deploy/tests/test-deploy.sh"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# Test 1: Missing GCP_PROJECT_ID fails fast without calling gcloud
# ------------------------------------------------------------------------------
new_test_env "test1_missing_project"
if output="$(GCP_PROJECT_ID="" PROJECT_ID="" bash "${DEPLOY_SCRIPT}" 2>&1)"; then
  fail_test "Expected deploy.sh to fail when GCP_PROJECT_ID is missing"
fi
if [[ "${output}" != *"ERROR: GCP_PROJECT_ID is required"* ]]; then
  fail_test "Expected explicit GCP_PROJECT_ID error message, got: ${output}"
fi
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "Expected zero gcloud commands when GCP_PROJECT_ID is missing"
fi
pass_test "Missing GCP_PROJECT_ID fails fast with zero GCP mutations"

# ------------------------------------------------------------------------------
# Test 2: DRY_RUN=1 executes zero real GCP/Docker commands & leaks zero secrets
# ------------------------------------------------------------------------------
new_test_env "test2_dry_run"
DRY_SECRET_PWD="DryRunSecret@Pass#2026/100:%"
DRY_JWT_SECRET="DryRunJwtSecretKey_32CharsMinimum_XYZ!"
output="$(
  DRY_RUN=1 \
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  WHATSSS_DB_PASSWORD="${DRY_SECRET_PWD}" \
  WHATSSS_JWT_SECRET="${DRY_JWT_SECRET}" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "DRY_RUN=1 must not invoke real/mocked gcloud, docker, or curl commands (found: $(cat "${MOCK_LOG_FILE}"))"
fi
if [[ "${output}" != *"[DRY-RUN] gcloud services enable"* || "${output}" != *"[DRY-RUN] gcloud run deploy whatsss"* ]]; then
  fail_test "DRY_RUN=1 output missing expected [DRY-RUN] commands"
fi
if [[ "${output}" == *"${DRY_SECRET_PWD}"* || "${output}" == *"DryRunSecret%40Pass"* || "${output}" == *"${DRY_JWT_SECRET}"* ]]; then
  fail_test "DRY_RUN=1 leaked secret values in terminal output"
fi
pass_test "DRY_RUN=1 performs zero GCP/Docker mutations and leaks zero secrets"

# ------------------------------------------------------------------------------
# Test 3: Database Password & Username URL Encoding (All 6 Mandatory Cases)
# ------------------------------------------------------------------------------
declare -a RAW_PASSWORDS=(
  "NormalPass123"
  "Pass@123"
  "Pass#123"
  "Pass/123"
  "Pass:123"
  "Pass%123"
)
declare -a EXPECTED_ENCODED=(
  "NormalPass123"
  "Pass%40123"
  "Pass%23123"
  "Pass%2F123"
  "Pass%3A123"
  "Pass%25123"
)

for i in "${!RAW_PASSWORDS[@]}"; do
  raw_pwd="${RAW_PASSWORDS[$i]}"
  enc_pwd="${EXPECTED_ENCODED[$i]}"
  new_test_env "test3_encode_${i}"

  output="$(
    GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
    DB_USER="whatsss@app" \
    WHATSSS_DB_PASSWORD="${raw_pwd}" \
    WHATSSS_JWT_SECRET="JwtSecret_ForEncodingTest_1234567890" \
    bash "${DEPLOY_SCRIPT}" 2>&1
  )"

  stored_url="$(cat "${MOCK_STATE_DIR}/secret_val_whatsss-database-url")"
  expected_url="postgresql://whatsss%40app:${enc_pwd}@localhost:5432/whatsss_db?host=/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql&schema=public"

  if [[ "${stored_url}" != "${expected_url}" ]]; then
    fail_test "URL encoding mismatch for '${raw_pwd}': expected '${expected_url}', got '${stored_url}'"
  fi

  if [[ "${output}" == *"${raw_pwd}"* || "${output}" == *"${stored_url}"* ]]; then
    fail_test "Log output leaked password or full DATABASE_URL for case '${raw_pwd}'"
  fi
done
pass_test "Database URL encoding verified for NormalPass123, Pass@123, Pass#123, Pass/123, Pass:123, Pass%123 & special-char username without log leaks"

# ------------------------------------------------------------------------------
# Test 4 & 5: First Deploy Creates Secrets; Second Deploy Preserves Credentials
# ------------------------------------------------------------------------------
new_test_env "test4_idempotent_secrets"
GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
WHATSSS_DB_PASSWORD="InitialDB@Pass#1" \
bash "${DEPLOY_SCRIPT}" >/dev/null 2>&1

initial_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
initial_secret_url="$(cat "${MOCK_STATE_DIR}/secret_val_whatsss-database-url")"
initial_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"

if [[ "${initial_sql_pwd}" != "InitialDB@Pass#1" || "${initial_ver}" != "1" ]]; then
  fail_test "First deploy did not initialize expected SQL user password and secret version 1"
fi

# Run second deploy with ROTATE_DB_PASSWORD=0 and a different WHATSSS_DB_PASSWORD
: > "${MOCK_LOG_FILE}"
GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
ROTATE_DB_PASSWORD=0 \
WHATSSS_DB_PASSWORD="UnintendedNewPass#2" \
bash "${DEPLOY_SCRIPT}" >/dev/null 2>&1

second_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
second_secret_url="$(cat "${MOCK_STATE_DIR}/secret_val_whatsss-database-url")"
second_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"

if [[ "${second_sql_pwd}" != "${initial_sql_pwd}" || "${second_secret_url}" != "${initial_secret_url}" || "${second_ver}" != "1" ]]; then
  fail_test "Second deploy mutated existing DB password or secret version when ROTATE_DB_PASSWORD=0"
fi
if grep -q "sql users set-password" "${MOCK_LOG_FILE}" || grep -q "secrets versions add" "${MOCK_LOG_FILE}"; then
  fail_test "Second deploy unexpectedly called set-password or secrets versions add"
fi
pass_test "Idempotent redeploy (ROTATE_DB_PASSWORD=0) preserves synchronized DB password and Secret Manager version"

# ------------------------------------------------------------------------------
# Test 6: Explicit Secret Rotation (ROTATE_DB_PASSWORD=1) Synchronizes DB & Secret
# ------------------------------------------------------------------------------
: > "${MOCK_LOG_FILE}"
GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
ROTATE_DB_PASSWORD=1 \
WHATSSS_DB_PASSWORD="Rotated@Pass/2026:99%" \
bash "${DEPLOY_SCRIPT}" >/dev/null 2>&1

rotated_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
rotated_secret_url="$(cat "${MOCK_STATE_DIR}/secret_val_whatsss-database-url")"
rotated_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"
expected_rotated_url="postgresql://whatsss_app:Rotated%40Pass%2F2026%3A99%25@localhost:5432/whatsss_db?host=/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql&schema=public"

if [[ "${rotated_sql_pwd}" != "Rotated@Pass/2026:99%" || "${rotated_secret_url}" != "${expected_rotated_url}" || "${rotated_ver}" != "2" ]]; then
  fail_test "Rotation (ROTATE_DB_PASSWORD=1) failed to synchronize Cloud SQL password and Secret Manager version 2"
fi
pass_test "Explicit credential rotation (ROTATE_DB_PASSWORD=1) updates Cloud SQL and Secret Manager in sync (version 2)"

# ------------------------------------------------------------------------------
# Test 7: Secret Update Failure During Rotation Aborts Before Cloud Run Deploy
# ------------------------------------------------------------------------------
: > "${MOCK_LOG_FILE}"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  ROTATE_DB_PASSWORD=1 \
  MOCK_FAIL_SECRET_UPDATE=1 \
  WHATSSS_DB_PASSWORD="FailedRotationPass123" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when Secret Manager version update fails"
fi
if [[ "${output}" != *"ERROR: Failed to add new secret version"* ]]; then
  fail_test "Expected secret version update failure error message, got: ${output}"
fi
if grep -q "run deploy" "${MOCK_LOG_FILE}" || grep -q "run jobs execute" "${MOCK_LOG_FILE}"; then
  fail_test "deploy.sh must not execute migration job or deploy Cloud Run when secret update fails"
fi
pass_test "Secret update failure aborts deployment before migration job or Cloud Run rollout"

# ------------------------------------------------------------------------------
# Test 8: Project IAM Binding Failure Fails Fast
# ------------------------------------------------------------------------------
new_test_env "test8_project_iam_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FAIL_PROJECT_IAM=1 \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when project IAM policy binding fails"
fi
if [[ "${output}" != *"ERROR: Failed to grant Cloud SQL Client to Runtime SA"* ]]; then
  fail_test "Expected Cloud SQL Client IAM error message, got: ${output}"
fi
if grep -q "sql instances" "${MOCK_LOG_FILE}" || grep -q "run deploy" "${MOCK_LOG_FILE}"; then
  fail_test "deploy.sh continued past project IAM failure"
fi
pass_test "Project IAM binding failure fails fast and stops deployment"

# ------------------------------------------------------------------------------
# Test 9: Secret Accessor IAM Binding Failure Fails Fast
# ------------------------------------------------------------------------------
new_test_env "test9_secret_iam_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FAIL_SECRET_IAM_TARGET="whatsss-jwt-secret" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when Secret Accessor IAM binding fails"
fi
if [[ "${output}" != *"ERROR: Failed to grant Secret Accessor for whatsss-jwt-secret"* ]]; then
  fail_test "Expected Secret Accessor failure message for whatsss-jwt-secret, got: ${output}"
fi
if grep -q "docker build" "${MOCK_LOG_FILE}" || grep -q "run deploy" "${MOCK_LOG_FILE}"; then
  fail_test "deploy.sh continued past Secret Accessor IAM failure"
fi
pass_test "Secret Accessor IAM binding failure fails fast and stops deployment"

# ------------------------------------------------------------------------------
# Test 10: R-07 Least-Privilege Verification Rejects Excessive Project Roles
# ------------------------------------------------------------------------------
new_test_env "test10_least_privilege_violation"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FORBIDDEN_SA_ROLE="roles/editor" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to reject Runtime SA holding roles/editor"
fi
if [[ "${output}" != *"Least-privilege violation (R-07)"* ]]; then
  fail_test "Expected R-07 least-privilege violation message, got: ${output}"
fi
pass_test "Runtime SA least-privilege verification rejects Owner/Editor/project-wide Secret Accessor roles"

# ------------------------------------------------------------------------------
# Test 11: Active gcloud Project Mismatch Guard
# ------------------------------------------------------------------------------
new_test_env "test11_project_mismatch"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_ACTIVE_PROJECT="some-other-gcp-project" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to abort when active gcloud project mismatches GCP_PROJECT_ID without CONFIRM_PROJECT=1"
fi
if [[ "${output}" != *"Active gcloud project ('some-other-gcp-project') differs from target GCP_PROJECT_ID"* ]]; then
  fail_test "Expected project mismatch error message, got: ${output}"
fi
pass_test "Active gcloud project mismatch guard prevents accidental cross-project deployment"

echo "=============================================================================="
echo " ALL ${PASS_COUNT} DEPLOY SCRIPT TESTS PASSED!"
echo "=============================================================================="
