#!/usr/bin/env python3
"""
deploy/tests/test_smoke.py — Automated Unit Tests for deploy/smoke_test.py
Project: Whatsss — Personal Money and Expense Logging System (CPE334 Lab 5)
"""

import io
import sys
import os
import unittest
from unittest.mock import MagicMock
import urllib.error

# Add parent directory to sys.path so we can import smoke_test
DEPLOY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if DEPLOY_DIR not in sys.path:
    sys.path.insert(0, DEPLOY_DIR)

import smoke_test

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

    def test_invalid_service_url_rejected(self):
        result = smoke_test.run_smoke_test("ftp://invalid-url.com")
        self.assertFalse(result)

    def test_all_public_checks_pass(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"ready","database":"connected"}')
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                # Unauthenticated gate check expects 401
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test("https://whatsss.run.app", opener=mock_opener)
        self.assertTrue(result)

    def test_health_failure_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(500, '{"status":"error"}')
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", opener=mock_opener)
        self.assertFalse(result)

    def test_ready_db_disconnected_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"not_ready","database":"disconnected"}')
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", opener=mock_opener)
        self.assertFalse(result)

    def test_root_non_html_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"ready","database":"connected"}')
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, 'Plain text non-html body')
            return MockHTTPResponse(200, "OK")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", opener=mock_opener)
        self.assertFalse(result)

    def test_accounts_unauthenticated_leak_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"ready","database":"connected"}')
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                # Returning 200 without cookies is an authentication leak
                return MockHTTPResponse(200, '[{"id":"acc_1","name":"Cash"}]')
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open
        result = smoke_test.run_smoke_test("https://whatsss.run.app", opener=mock_opener)
        self.assertFalse(result)

    def test_partial_credentials_email_only_fails(self):
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password=""
        )
        self.assertFalse(result)

    def test_partial_credentials_password_only_fails(self):
        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="",
            smoke_password="secretpassword"
        )
        self.assertFalse(result)

    def test_authenticated_flow_success(self):
        mock_opener = MagicMock()
        logged_in = False

        def mock_open(req, timeout=15):
            nonlocal logged_in
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"ready","database":"connected"}')
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                logged_in = True
                return MockHTTPResponse(200, '{"user":{"id":"usr_1","email":"user@example.com"}}')
            elif url.endswith("/api/auth/me"):
                if logged_in:
                    return MockHTTPResponse(200, '{"user":{"id":"usr_1","email":"user@example.com"}}')
                else:
                    raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/logout"):
                logged_in = False
                return MockHTTPResponse(200, '{"message":"Logged out"}')
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            opener=mock_opener
        )
        self.assertTrue(result)

    def test_authenticated_flow_post_logout_leak_aborts(self):
        mock_opener = MagicMock()

        def mock_open(req, timeout=15):
            url = req.full_url
            if url.endswith("/api/health"):
                return MockHTTPResponse(200, '{"status":"ok"}')
            elif url.endswith("/api/ready"):
                return MockHTTPResponse(200, '{"status":"ready","database":"connected"}')
            elif url.rstrip("/").endswith("run.app") or url.endswith("/"):
                return MockHTTPResponse(200, '<!doctype html><html><body>Whatsss</body></html>')
            elif url.endswith("/api/accounts"):
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":"Unauthorized"}'))
            elif url.endswith("/api/auth/login"):
                return MockHTTPResponse(200, '{"user":{"id":"usr_1"}}')
            elif url.endswith("/api/auth/me"):
                # Session leak: returns 200 even after logout
                return MockHTTPResponse(200, '{"user":{"id":"usr_1"}}')
            elif url.endswith("/api/auth/logout"):
                return MockHTTPResponse(200, '{"message":"Logged out"}')
            return MockHTTPResponse(404, "Not Found")

        mock_opener.open.side_effect = mock_open

        result = smoke_test.run_smoke_test(
            "https://whatsss.run.app",
            smoke_email="user@example.com",
            smoke_password="validpassword123",
            opener=mock_opener
        )
        self.assertFalse(result)

if __name__ == "__main__":
    unittest.main()
