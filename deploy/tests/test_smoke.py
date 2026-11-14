#!/usr/bin/env python3
"""
deploy/tests/test_smoke.py — Automated Unit Tests for deploy/smoke_test.py
Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
"""

import io
import sys
import os
import json
import unittest
from unittest.mock import MagicMock
import urllib.error

# Add parent directory to sys.path so we can import smoke_test
DEPLOY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if DEPLOY_DIR not in sys.path:
    sys.path.insert(0, DEPLOY_DIR)

import smoke_test

VALID_SHA = "a" * 40
OTHER_SHA = "b" * 40

class MockHTTPResponse:
    def __init__(self, status, body, headers=None):
        self.status = status
        self.body = body.encode("utf-8") if isinstance(body, str) else body
        self.headers = headers or {}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

class TestSmokeTest(unittest.TestCase):
    def setUp(self):
        # Silence stdout/stderr during unit test assertions
        self.saved_stdout = sys.stdout
        self.saved_stderr = sys.stderr
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()

    def tearDown(self):
        sys.stdout = self.saved_stdout
        sys.stderr = self.saved_stderr

    # --------------------------------------------------------------------------
    # URL Validation & HTTPS Enforcement Tests (Requirements A.2 & A.3)
    # --------------------------------------------------------------------------
    def test_ftp_service_url_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("ftp://invalid-url.com", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_http_unauthenticated_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("http://localhost:8080", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_http_authenticated_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test(
            "http://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_url_with_query_string_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://whatsss.run.app?foo=bar", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_url_with_fragment_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://whatsss.run.app#dashboard", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_url_with_embedded_credentials_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://admin:secret@whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_url_without_hostname_rejected_before_network(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_empty_or_non_string_url_rejected_before_network(self):
        mock_opener = MagicMock()
        self.assertFalse(smoke_test.run_smoke_test("", expected_commit_sha=VALID_SHA, opener=mock_opener))
        self.assertFalse(smoke_test.run_smoke_test(None, expected_commit_sha=VALID_SHA, opener=mock_opener))
        mock_opener.open.assert_not_called()

    # --------------------------------------------------------------------------
    # Commit SHA Validation Tests (Requirement A.1)
    # --------------------------------------------------------------------------
    def test_missing_expected_commit_sha_fails_fast(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha="", opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_invalid_length_expected_commit_sha_fails_fast(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha="12345678", opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_non_hex_expected_commit_sha_fails_fast(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha="z" * 40, opener=mock_opener)
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_health_commit_sha_mismatch_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": OTHER_SHA}))
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_health_missing_commit_sha_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok"}))
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_ready_commit_sha_mismatch_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": OTHER_SHA}))
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_ready_missing_commit_sha_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected"}))
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    # --------------------------------------------------------------------------
    # Public Endpoint Checks Tests (Probes, UI, Security Gate)
    # --------------------------------------------------------------------------
    def test_all_public_checks_pass(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                # Unauthenticated gate check expects 401
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertTrue(result)

    def test_health_failure_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(500, '{"status":"error"}')
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_ready_db_disconnected_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "not_ready", "database": "disconnected", "commitSha": VALID_SHA}))
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_root_non_html_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, 'Plain text non-html body')
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    def test_accounts_unauthenticated_leak_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                # Returning 200 without cookies is an authentication leak
                return MockHTTPResponse(200, '[{"id":"acc_1","name":"Cash"}]')
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", expected_commit_sha=VALID_SHA, opener=mock_opener)
        self.assertFalse(result)

    # --------------------------------------------------------------------------
    # Credential Completeness Tests
    # --------------------------------------------------------------------------
    def test_partial_credentials_email_only_fails(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    def test_partial_credentials_password_only_fails(self):
        mock_opener = MagicMock()
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)
        mock_opener.open.assert_not_called()

    # --------------------------------------------------------------------------
    # Authentication & User Validation Tests (Requirements A.4, A.5, A.6, A.7)
    # --------------------------------------------------------------------------
    def test_authenticated_flow_success_standard_contract(self):
        mock_opener = MagicMock()
        logged_in = False

        def mock_open(req, timeout=15):
            nonlocal logged_in
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                # Requirement A.7: Verify Login Security Headers and Payload
                self.assertEqual(req.headers.get("Origin"), "https://whatsss.run.app")
                self.assertEqual(req.headers.get("Content-type"), "application/json")
                payload = json.loads(req.data.decode("utf-8"))
                self.assertEqual(payload["username"], "user@example.com")
                self.assertEqual(payload["password"], "validpassword123")
                self.assertNotIn("email", payload)
                logged_in = True
                # Standard backend format: { "success": true, "data": { "user": { "id": "usr_1", "username": "user@example.com" } } }
                return MockHTTPResponse(200, json.dumps({
                    "success": True,
                    "data": {
                        "user": {
                            "id": "usr_1",
                            "username": "user@example.com",
                            "role": "USER"
                        }
                    }
                }))
            elif url.endswith("/api/auth/me"):
                if logged_in:
                    return MockHTTPResponse(200, json.dumps({
                        "success": True,
                        "data": {
                            "user": {
                                "id": "usr_1",
                                "username": "user@example.com",
                                "role": "USER"
                            }
                        }
                    }))
                else:
                    raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/logout"):
                logged_in = False
                return MockHTTPResponse(200, json.dumps({"success": True, "data": {"message": "Logged out"}}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertTrue(result)

    def test_login_missing_user_object_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                # Missing user object in data
                return MockHTTPResponse(200, json.dumps({"success": True, "data": {}}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_login_missing_user_id_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                # Empty / missing id in user
                return MockHTTPResponse(200, json.dumps({
                    "data": {"user": {"id": "", "username": "user@example.com"}}
                }))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_login_incorrect_username_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                # Username returned doesn't match smoke_email
                return MockHTTPResponse(200, json.dumps({
                    "data": {"user": {"id": "usr_99", "username": "wrong_user@example.com"}}
                }))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_login_malformed_json_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, "non-json response body")
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_auth_me_missing_user_object_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, json.dumps({"data": {"user": {"id": "usr_1", "username": "user@example.com"}}}))
            elif url.endswith("/api/auth/me"):
                # Missing user object in /api/auth/me
                return MockHTTPResponse(200, json.dumps({"data": {}}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_auth_me_user_id_mismatch_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, json.dumps({"data": {"user": {"id": "usr_1", "username": "user@example.com"}}}))
            elif url.endswith("/api/auth/me"):
                # Different user ID in /api/auth/me
                return MockHTTPResponse(200, json.dumps({"data": {"user": {"id": "usr_different", "username": "user@example.com"}}}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_auth_me_username_mismatch_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, json.dumps({"data": {"user": {"id": "usr_1", "username": "user@example.com"}}}))
            elif url.endswith("/api/auth/me"):
                # Different username in /api/auth/me
                return MockHTTPResponse(200, json.dumps({"data": {"user": {"id": "usr_1", "username": "other@example.com"}}}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

    def test_authenticated_flow_post_logout_leak_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, json.dumps({"status": "ok", "commitSha": VALID_SHA}))
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, json.dumps({"status": "ready", "database": "connected", "commitSha": VALID_SHA}))
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, json.dumps({"user": {"id": "usr_1", "username": "user@example.com"}}))
            elif url.endswith("/api/auth/me"):
                # Session leak: returns 200 even after logout
                return MockHTTPResponse(200, json.dumps({"user": {"id": "usr_1", "username": "user@example.com"}}))
            elif url.endswith("/api/auth/logout"):
                return MockHTTPResponse(200, json.dumps({"message": "Logged out"}))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            expected_commit_sha=VALID_SHA,
            opener=mock_opener
        )
        self.assertFalse(result)

if __name__ == "__main__":
    unittest.main()
