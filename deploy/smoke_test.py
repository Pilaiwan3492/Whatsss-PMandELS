#!/usr/bin/env python3
"""
deploy/smoke_test.py - Automated Post-Deployment Verification
Project: Whatsss - Personal Money and Expense Logging System
Lab 5 (Episode 7 & Checkpoint C-06)

Checks public URL health, readiness, web UI landing, and protected API endpoints.
Optionally verifies authenticated user flow if SMOKE_EMAIL and SMOKE_PASSWORD exist.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import http.cookiejar

def make_request(url, method="GET", data=None, headers=None, opener=None):
    if headers is None:
        headers = {}
    
    encoded_data = None
    if data is not None:
        if isinstance(data, (dict, list)):
            encoded_data = json.dumps(data).encode("utf-8")
            if "Content-Type" not in headers:
                headers["Content-Type"] = "application/json"
        elif isinstance(data, str):
            encoded_data = data.encode("utf-8")
        else:
            encoded_data = data

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    
    if opener is None:
        opener = urllib.request.build_opener()
        
    try:
        with opener.open(req, timeout=15) as response:
            status = response.status
            body = response.read().decode("utf-8", errors="replace")
            return status, body, response.headers
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body, e.headers
    except Exception as e:
        print(f"FAIL: Network error requesting {url}: {e}", file=sys.stderr)
        raise

def run_smoke_test(base_url, smoke_email="", smoke_password="", opener=None):
    base_url = base_url.rstrip("/")
    if not base_url.startswith("https://") and not base_url.startswith("http://"):
        print(f"FAIL: Service URL must start with http:// or https:// (got: '{base_url}')", file=sys.stderr)
        return False

    # Validate credentials before making any network requests
    if bool(smoke_email) != bool(smoke_password):
        print("FAIL: Both SMOKE_EMAIL and SMOKE_PASSWORD must be configured together.", file=sys.stderr)
        return False

    print(f"Running automated smoke test on: {base_url}")

    # 1. Check Liveness Probe: GET /api/health
    health_url = f"{base_url}/api/health"
    try:
        status, body, _ = make_request(health_url, opener=opener)
    except Exception:
        return False

    if status != 200:
        print(f"FAIL /api/health: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
        return False
    try:
        health_json = json.loads(body)
        if health_json.get("status") != "ok":
            print(f"FAIL /api/health: Expected status 'ok', got {health_json}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"FAIL /api/health: Invalid JSON response: {e}", file=sys.stderr)
        return False
    print("PASS /api/health")

    # 2. Check Database Readiness Probe: GET /api/ready
    ready_url = f"{base_url}/api/ready"
    try:
        status, body, _ = make_request(ready_url, opener=opener)
    except Exception:
        return False

    if status != 200:
        print(f"FAIL /api/ready: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
        return False
    try:
        ready_json = json.loads(body)
        if ready_json.get("status") != "ready" or ready_json.get("database") != "connected":
            print(f"FAIL /api/ready: Expected ready/connected, got {ready_json}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"FAIL /api/ready: Invalid JSON response: {e}", file=sys.stderr)
        return False
    print("PASS /api/ready")

    # 3. Check Web UI Single-Page App: GET /
    try:
        status, body, _ = make_request(f"{base_url}/", opener=opener)
    except Exception:
        return False

    if status != 200 or ("<!doctype html>" not in body.lower() and "<html" not in body.lower()):
        print(f"FAIL /: Expected HTTP 200 with HTML document, got {status}", file=sys.stderr)
        return False
    print("PASS /")

    # 4. Check Unauthenticated API Security Gate: GET /api/accounts
    try:
        status, body, _ = make_request(f"{base_url}/api/accounts", opener=opener)
    except Exception:
        return False

    if status != 401:
        print(f"FAIL /api/accounts: Expected HTTP 401 Unauthenticated without cookies, got {status}", file=sys.stderr)
        return False
    print("PASS /api/accounts (unauthenticated gate check)")

    # 5. Optional Authenticated User Flow
    if smoke_email and smoke_password:
        print("Testing authenticated user flow...")
        if opener is None:
            cj = http.cookiejar.CookieJar()
            auth_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        else:
            auth_opener = opener

        login_url = f"{base_url}/api/auth/login"
        login_headers = {
            "Origin": base_url,
            "Content-Type": "application/json"
        }
        # Backend in auth.controller.ts expects username and password
        login_payload = {
            "username": smoke_email,
            "password": smoke_password
        }

        try:
            status, body, _ = make_request(login_url, method="POST", data=login_payload, headers=login_headers, opener=auth_opener)
        except Exception:
            return False

        if status != 200:
            print(f"FAIL login: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
            return False

        me_url = f"{base_url}/api/auth/me"
        try:
            status, body, _ = make_request(me_url, method="GET", opener=auth_opener)
        except Exception:
            return False

        if status != 200:
            print(f"FAIL /api/auth/me: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
            return False

        logout_url = f"{base_url}/api/auth/logout"
        logout_headers = {
            "Origin": base_url,
            "Content-Type": "application/json"
        }
        try:
            status, body, _ = make_request(logout_url, method="POST", data={}, headers=logout_headers, opener=auth_opener)
        except Exception:
            return False

        if status != 200:
            print(f"FAIL logout: Expected HTTP 200, got {status}", file=sys.stderr)
            return False

        # Post-logout session verification: Calling /api/auth/me again must return 401
        try:
            status, body, _ = make_request(me_url, method="GET", opener=auth_opener)
        except Exception:
            return False

        if status != 401:
            print(f"FAIL post-logout /api/auth/me: Expected HTTP 401 Unauthenticated, got {status}", file=sys.stderr)
            return False

        print("PASS login and authenticated /api/auth/me")
        print("PASS logout and verified session invalidation")
    else:
        print("SKIP: Login test skipped because smoke credentials are not configured.")

    print("\nALL SMOKE TEST CHECKS PASSED SUCCESSFULLY!")
    return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 deploy/smoke_test.py <SERVICE_URL>", file=sys.stderr)
        sys.exit(1)

    base_url = sys.argv[1]
    smoke_email = os.environ.get("SMOKE_EMAIL", "").strip()
    smoke_password = os.environ.get("SMOKE_PASSWORD", "").strip()

    success = run_smoke_test(base_url, smoke_email, smoke_password)
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
