#!/usr/bin/env python3
"""
Unit tests for Cloud Run revision APP_COMMIT_SHA extraction.

Covers:
- Valid SHA extraction from primary container.
- Valid SHA extraction from second container.
- Missing APP_COMMIT_SHA environment variable.
- Empty or whitespace-only APP_COMMIT_SHA value.
- Non-string APP_COMMIT_SHA value.
- Invalid SHA formats (length != 40, uppercase hex, non-hex characters).
- Duplicate APP_COMMIT_SHA entries within the same container.
- Duplicate APP_COMMIT_SHA entries across multiple containers.
- Expected SHA comparison matching and mismatching.
- CLI main() execution with stdin and arguments.
"""

import io
import sys
import os
import unittest
import subprocess
from unittest.mock import patch

# Add parent directory to sys.path so we can import extract_revision_sha
DEPLOY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if DEPLOY_DIR not in sys.path:
    sys.path.insert(0, DEPLOY_DIR)

import extract_revision_sha

VALID_SHA = "0123456789abcdef0123456789abcdef01234567"
OTHER_VALID_SHA = "abcdef0123456789abcdef0123456789abcdef01"


class TestExtractRevisionSha(unittest.TestCase):

    def _build_revision(self, containers):
        return {
            "apiVersion": "serving.knative.dev/v1",
            "kind": "Revision",
            "metadata": {"name": "whatsss-00042-xyz"},
            "spec": {
                "containers": containers
            }
        }

    # 1. Valid SHA Cases
    def test_valid_sha_extraction_single_container(self):
        revision = self._build_revision([
            {
                "name": "app",
                "image": "gcr.io/test/whatsss@sha256:abc",
                "env": [
                    {"name": "PORT", "value": "8080"},
                    {"name": "APP_COMMIT_SHA", "value": VALID_SHA}
                ]
            }
        ])
        result = extract_revision_sha.extract_app_commit_sha(revision)
        self.assertEqual(result, VALID_SHA)

    def test_valid_sha_matching_expected_sha(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA}]
            }
        ])
        result = extract_revision_sha.extract_app_commit_sha(revision, expected_sha=VALID_SHA)
        self.assertEqual(result, VALID_SHA)

    def test_expected_sha_mismatch_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision, expected_sha=OTHER_VALID_SHA)
        self.assertIn("mismatch", str(ctx.exception).lower())

    # 2. Missing APP_COMMIT_SHA
    def test_missing_app_commit_sha_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [
                    {"name": "PORT", "value": "8080"},
                    {"name": "NODE_ENV", "value": "production"}
                ]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("missing", str(ctx.exception).lower())

    def test_empty_env_list_raises_value_error(self):
        revision = self._build_revision([{"name": "app", "env": []}])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("missing", str(ctx.exception).lower())

    # 3. Empty or Non-String Value
    def test_empty_app_commit_sha_value_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": ""}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("empty", str(ctx.exception).lower())

    def test_whitespace_app_commit_sha_value_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": "   "}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("empty", str(ctx.exception).lower())

    def test_non_string_app_commit_sha_value_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": 12345}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("string", str(ctx.exception).lower())

    # 4. Invalid SHA Formats
    def test_short_sha_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": "0123456789abcdef"}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("40 lowercase hexadecimal", str(ctx.exception))

    def test_long_sha_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA + "a"}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("40 lowercase hexadecimal", str(ctx.exception))

    def test_uppercase_sha_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA.upper()}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("40 lowercase hexadecimal", str(ctx.exception))

    def test_non_hex_sha_raises_value_error(self):
        bad_sha = "g" * 40
        revision = self._build_revision([
            {
                "name": "app",
                "env": [{"name": "APP_COMMIT_SHA", "value": bad_sha}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("40 lowercase hexadecimal", str(ctx.exception))

    # 5. Duplicate APP_COMMIT_SHA Entries
    def test_duplicate_app_commit_sha_same_container_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app",
                "env": [
                    {"name": "APP_COMMIT_SHA", "value": VALID_SHA},
                    {"name": "APP_COMMIT_SHA", "value": VALID_SHA}
                ]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("duplicate", str(ctx.exception).lower())

    def test_duplicate_app_commit_sha_multiple_containers_raises_value_error(self):
        revision = self._build_revision([
            {
                "name": "app-primary",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA}]
            },
            {
                "name": "app-sidecar",
                "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA}]
            }
        ])
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha(revision)
        self.assertIn("duplicate", str(ctx.exception).lower())

    # 6. APP_COMMIT_SHA in Second Container
    def test_app_commit_sha_in_second_container_extracted_successfully(self):
        revision = self._build_revision([
            {
                "name": "sidecar-proxy",
                "env": [{"name": "PROXY_PORT", "value": "8081"}]
            },
            {
                "name": "app-backend",
                "env": [
                    {"name": "PORT", "value": "8080"},
                    {"name": "APP_COMMIT_SHA", "value": VALID_SHA}
                ]
            }
        ])
        result = extract_revision_sha.extract_app_commit_sha(revision)
        self.assertEqual(result, VALID_SHA)

    # 7. Structural Validation
    def test_malformed_json_string_raises_value_error(self):
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha("not-json-content")
        self.assertIn("invalid json", str(ctx.exception).lower())

    def test_missing_spec_raises_value_error(self):
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha({"metadata": {}})
        self.assertIn("spec", str(ctx.exception).lower())

    def test_empty_containers_list_raises_value_error(self):
        with self.assertRaises(ValueError) as ctx:
            extract_revision_sha.extract_app_commit_sha({"spec": {"containers": []}})
        self.assertIn("containers", str(ctx.exception).lower())

    # 8. CLI Execution Tests
    def test_cli_main_success_via_stdin(self):
        import json
        valid_json = json.dumps(self._build_revision([
            {"name": "app", "env": [{"name": "APP_COMMIT_SHA", "value": VALID_SHA}]}
        ]))

        with patch("sys.stdin", io.StringIO(valid_json)):
            with patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                with patch("sys.argv", ["extract_revision_sha.py", "--expected-sha", VALID_SHA]):
                    with self.assertRaises(SystemExit) as cm:
                        extract_revision_sha.main()
                    self.assertEqual(cm.exception.code, 0)
                    self.assertEqual(mock_stdout.getvalue().strip(), VALID_SHA)

    def test_cli_main_failure_exits_nonzero(self):
        import json
        bad_json = json.dumps(self._build_revision([
            {"name": "app", "env": [{"name": "APP_COMMIT_SHA", "value": "bad_sha"}]}
        ]))

        with patch("sys.stdin", io.StringIO(bad_json)):
            with patch("sys.stderr", new_callable=io.StringIO) as mock_stderr:
                with patch("sys.argv", ["extract_revision_sha.py"]):
                    with self.assertRaises(SystemExit) as cm:
                        extract_revision_sha.main()
                    self.assertEqual(cm.exception.code, 1)
                    self.assertIn("40 lowercase hexadecimal", mock_stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
