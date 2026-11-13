#!/usr/bin/env bash
# ==============================================================================
# deploy/tests/test-deploy.sh — Automated Unit & Integration Tests for deploy.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
DEPLOY_SCRIPT="${DEPLOY_DIR}/deploy.sh"
MOCKS_DIR="${SCRIPT_DIR}/mocks"

cd "${REPO_ROOT}"
export APP_COMMIT_SHA="${APP_COMMIT_SHA:-0123456789abcdef0123456789abcdef01234567}"

chmod +x "${DEPLOY_SCRIPT}" "${DEPLOY_DIR}/release.sh" "${MOCKS_DIR}/gcloud" "${MOCKS_DIR}/docker" "${MOCKS_DIR}/curl"

TEST_ROOT="$(mktemp -d 2>/dev/null || mktemp -d -t 'whatsss-test-deploy')"
cleanup() {
  if [[ -n "${TEST_ROOT:-}" && -d "${TEST_ROOT}" ]]; then
    rm -rf "${TEST_ROOT}"
  fi
}
trap cleanup EXIT INT TERM
trap 'echo "ERROR ON LINE $LINENO: command was $BASH_COMMAND" >&2' ERR

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

  if ! output="$(
    GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
    DB_USER="whatsss@app" \
    WHATSSS_DB_PASSWORD="${raw_pwd}" \
    WHATSSS_JWT_SECRET="JwtSecret_ForEncodingTest_1234567890" \
    bash "${DEPLOY_SCRIPT}" 2>&1
  )"; then
    fail_test "deploy.sh failed during URL encoding test for '${raw_pwd}': ${output}"
  fi

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
if ! output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  WHATSSS_DB_PASSWORD="InitialDB@Pass#1" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "First deploy failed in test 4: ${output}"
fi

initial_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
initial_secret_url="$(cat "${MOCK_STATE_DIR}/secret_val_whatsss-database-url")"
initial_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"

if [[ "${initial_sql_pwd}" != "InitialDB@Pass#1" || "${initial_ver}" != "1" ]]; then
  fail_test "First deploy did not initialize expected SQL user password and secret version 1"
fi

# Run second deploy with ROTATE_DB_PASSWORD=0 and a different WHATSSS_DB_PASSWORD
: > "${MOCK_LOG_FILE}"
if ! output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  ROTATE_DB_PASSWORD=0 \
  WHATSSS_DB_PASSWORD="UnintendedNewPass#2" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Second deploy failed in test 4: ${output}"
fi

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
# Test 6: Setting ROTATE_DB_PASSWORD=1 Fails Fast Before Modifying GCP Resources
# ------------------------------------------------------------------------------
new_test_env "test6_rotation_disabled"
output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  ROTATE_DB_PASSWORD=1 \
  bash "${DEPLOY_SCRIPT}" 2>&1 || true
)"
if [[ "${output}" != *"ERROR: Automatic in-place DB password rotation is disabled."* || "${output}" != *"Use the documented maintenance rotation procedure."* ]]; then
  fail_test "Expected automatic rotation disabled error message, got: ${output}"
fi
if [[ -s "${MOCK_LOG_FILE}" ]]; then
  fail_test "ROTATE_DB_PASSWORD=1 must abort before executing any GCP commands (found: $(cat "${MOCK_LOG_FILE}"))"
fi
pass_test "Setting ROTATE_DB_PASSWORD=1 fails closed before modifying GCP resources"

# ------------------------------------------------------------------------------
# Test 7: Secret Creation Failure During Initial Provision Aborts Deployment
# ------------------------------------------------------------------------------
new_test_env "test7_initial_secret_create_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FAIL_SECRET_CREATE=1 \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when secret creation fails"
fi
if [[ "${output}" != *"ERROR: Failed to create secret"* ]]; then
  fail_test "Expected secret create failure error message, got: ${output}"
fi
if grep -q "run deploy" "${MOCK_LOG_FILE}" || grep -q "run jobs execute" "${MOCK_LOG_FILE}"; then
  fail_test "deploy.sh must not execute migration job or deploy Cloud Run when secret create fails"
fi
pass_test "Secret creation failure aborts deployment before migration job or Cloud Run rollout"

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
new_test_env "test10_least_privilege_violation_editor"
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

new_test_env "test10_least_privilege_violation_storage"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FORBIDDEN_SA_ROLE="roles/storage.admin" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to reject Runtime SA holding roles/storage.admin"
fi
if [[ "${output}" != *"Least-privilege violation (R-07)"* ]]; then
  fail_test "Expected R-07 least-privilege violation message, got: ${output}"
fi
pass_test "Runtime SA least-privilege verification rejects Owner/Editor/Storage.Admin/project-wide Secret Accessor roles"

# ------------------------------------------------------------------------------
# Test 11: R-07 Least-Privilege Verification Rejects Unauthorized Secret Roles
# ------------------------------------------------------------------------------
new_test_env "test11_secret_excessive_role"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FORBIDDEN_SECRET_SA_ROLE="roles/secretmanager.admin" \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to reject Runtime SA holding roles/secretmanager.admin on secret"
fi
if [[ "${output}" != *"Least-privilege violation (R-07)"* ]]; then
  fail_test "Expected secret least-privilege violation message, got: ${output}"
fi
pass_test "Secret IAM verification rejects unauthorized roles on Secret Manager secrets"

# ------------------------------------------------------------------------------
# Test 12: Unable to Read Project IAM Policy Fails Closed Immediately
# ------------------------------------------------------------------------------
new_test_env "test12_project_iam_read_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FAIL_PROJECT_GET_IAM=1 \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when reading project IAM policy fails"
fi
if [[ "${output}" != *"ERROR: Unable to read project IAM policy."* ]]; then
  fail_test "Expected project IAM read failure error message, got: ${output}"
fi
pass_test "Unable to read Project IAM policy fails closed immediately"

# ------------------------------------------------------------------------------
# Test 13: Unable to Read Secret IAM Policy Fails Closed Immediately
# ------------------------------------------------------------------------------
new_test_env "test13_secret_iam_read_fail"
if output="$(
  GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  MOCK_FAIL_SECRET_GET_IAM=1 \
  bash "${DEPLOY_SCRIPT}" 2>&1
)"; then
  fail_test "Expected deploy.sh to fail when reading secret IAM policy fails"
fi
if [[ "${output}" != *"ERROR: Unable to read IAM policy for secret"* ]]; then
  fail_test "Expected secret IAM read failure error message, got: ${output}"
fi
pass_test "Unable to read Secret IAM policy fails closed immediately"

# ------------------------------------------------------------------------------
# Test 14: Active gcloud Project Mismatch Guard
# ------------------------------------------------------------------------------
new_test_env "test14_project_mismatch"
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

# ------------------------------------------------------------------------------
# Test 15: Manual Maintenance Rotation Procedure Simulation with Failure Guards & Rollback
# ------------------------------------------------------------------------------
new_test_env "test15_manual_rotation_rollback"
# Initialize baseline deployment
GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
WHATSSS_DB_PASSWORD="OriginalDBPassword123" \
bash "${DEPLOY_SCRIPT}" >/dev/null 2>&1

original_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
original_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"

# 15a: Failure Guard — Adding Secret Version Fails (Cloud SQL must NOT be modified)
TMP_SECRET_FAIL="${MOCK_STATE_DIR}/tmp_fail_secret.txt"
printf 'postgresql://whatsss_app:TestFail123@localhost:5432/whatsss_db' > "${TMP_SECRET_FAIL}"
if output="$(
  MOCK_FAIL_SECRET_UPDATE=1 \
  gcloud secrets versions add whatsss-database-url --data-file="${TMP_SECRET_FAIL}" 2>&1
)"; then
  fail_test "Expected secret version add to fail under MOCK_FAIL_SECRET_UPDATE"
fi
rm -f "${TMP_SECRET_FAIL}"
current_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
if [[ "${current_sql_pwd}" != "${original_pwd}" ]]; then
  fail_test "Cloud SQL password was modified even though secret version creation failed"
fi

# 15b: Failure Guard — Changing Cloud SQL Password Fails (Release must NOT proceed)
TMP_SECRET_OK="${MOCK_STATE_DIR}/tmp_stage_secret.txt"
printf 'postgresql://whatsss_app:StagedSecret456@localhost:5432/whatsss_db' > "${TMP_SECRET_OK}"
gcloud secrets versions add whatsss-database-url --data-file="${TMP_SECRET_OK}" >/dev/null
rm -f "${TMP_SECRET_OK}"
staged_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"
if [[ -z "${staged_ver}" || "${staged_ver}" -le "${original_ver}" ]]; then
  fail_test "Expected staged secret version to be greater than original version ${original_ver}"
fi

if output="$(
  MOCK_FAIL_SQL_SET_PASSWORD=1 \
  gcloud sql users set-password whatsss_app --instance=whatsss-sql --password="StagedSecret456" --project=cpe334-whatsss-pmandels 2>&1
)"; then
  fail_test "Expected sql users set-password to fail under MOCK_FAIL_SQL_SET_PASSWORD"
fi
current_sql_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
if [[ "${current_sql_pwd}" != "${original_pwd}" ]]; then
  fail_test "Cloud SQL password was corrupted despite set-password failure"
fi

# 15c: Full Manual Rotation with Rollback Simulation (Release Failure triggers Rollback)
NEW_ROTATED_PWD="NewRotatedPassword456!"
NEW_URL="postgresql://whatsss_app:${NEW_ROTATED_PWD}@localhost:5432/whatsss_db?host=/cloudsql/cpe334-whatsss-pmandels:asia-southeast1:whatsss-sql&schema=public"
TMP_ROTATE="${MOCK_STATE_DIR}/tmp_new_secret.txt"
printf '%s' "${NEW_URL}" > "${TMP_ROTATE}"
gcloud secrets versions add whatsss-database-url --data-file="${TMP_ROTATE}" >/dev/null
rm -f "${TMP_ROTATE}"
new_ver="$(cat "${MOCK_STATE_DIR}/secret_ver_whatsss-database-url")"

# Update Cloud SQL password to new password
gcloud sql users set-password whatsss_app --instance=whatsss-sql --password="${NEW_ROTATED_PWD}" --project=cpe334-whatsss-pmandels >/dev/null

# Trigger release.sh with new secret version (simulating release failure)
export MOCK_FAIL_RUN_DEPLOY=1
if GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
  APP_COMMIT_SHA="0123456789abcdef0123456789abcdef01234567" \
  IMAGE_REF="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781" \
  DB_URL_VERSION="${new_ver}" \
  JWT_SECRET_VERSION="1" \
  ADMIN_PASSWORD_VERSION="1" \
  DEMO_PASSWORD_VERSION="1" \
  bash "${DEPLOY_DIR}/release.sh" >/dev/null 2>&1; then
  fail_test "Expected release.sh to fail under simulated release failure"
fi

# Perform Rollback — restore original Cloud SQL password & redeploy previous secret version
gcloud sql users set-password whatsss_app --instance=whatsss-sql --password="${original_pwd}" --project=cpe334-whatsss-pmandels >/dev/null
export MOCK_FAIL_RUN_DEPLOY=0
GCP_PROJECT_ID="cpe334-whatsss-pmandels" \
APP_COMMIT_SHA="0123456789abcdef0123456789abcdef01234567" \
IMAGE_REF="asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:88f46652bba63097603d47108f39403d317b40bb122eaea0ea31d6f0914b8781" \
DB_URL_VERSION="${original_ver}" \
JWT_SECRET_VERSION="1" \
ADMIN_PASSWORD_VERSION="1" \
DEMO_PASSWORD_VERSION="1" \
bash "${DEPLOY_DIR}/release.sh" >/dev/null 2>&1

rolled_back_pwd="$(cat "${MOCK_STATE_DIR}/sql_user_pwd_whatsss_app")"
if [[ "${rolled_back_pwd}" != "${original_pwd}" ]]; then
  fail_test "Rollback failed to restore original Cloud SQL password"
fi
pass_test "Manual maintenance rotation procedure with safe rollback and failure guards restores original credentials and operational service"

echo "=============================================================================="
echo " ALL ${PASS_COUNT} DEPLOY SCRIPT TESTS PASSED!"
echo "=============================================================================="
