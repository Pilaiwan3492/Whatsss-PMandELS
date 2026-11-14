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
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 deploy/smoke_test.py <SERVICE_URL>", file=sys.stderr)
        sys.exit(1)

    base_url = sys.argv[1].rstrip("/")
    if not base_url.startswith("https://") and not base_url.startswith("http://"):
        print(f"FAIL: Service URL must start with http:// or https:// (got: '{base_url}')", file=sys.stderr)
        sys.exit(1)

    print(f"Running automated smoke test on: {base_url}")

    # 1. Check Liveness Probe: GET /api/health
    health_url = f"{base_url}/api/health"
    status, body, _ = make_request(health_url)
    if status != 200:
        print(f"FAIL /api/health: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
        sys.exit(1)
    try:
        health_json = json.loads(body)
        if health_json.get("status") != "ok":
            print(f"FAIL /api/health: Expected status 'ok', got {health_json}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"FAIL /api/health: Invalid JSON response: {e}", file=sys.stderr)
        sys.exit(1)
    print("PASS /api/health")

    # 2. Check Database Readiness Probe: GET /api/ready
    ready_url = f"{base_url}/api/ready"
    status, body, _ = make_request(ready_url)
    if status != 200:
        print(f"FAIL /api/ready: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
        sys.exit(1)
    try:
        ready_json = json.loads(body)
        if ready_json.get("status") != "ready" or ready_json.get("database") != "connected":
            print(f"FAIL /api/ready: Expected ready/connected, got {ready_json}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"FAIL /api/ready: Invalid JSON response: {e}", file=sys.stderr)
        sys.exit(1)
    print("PASS /api/ready")

    # 3. Check Web UI Single-Page App: GET /
    status, body, _ = make_request(f"{base_url}/")
    if status != 200 or ("<!doctype html>" not in body.lower() and "<html" not in body.lower()):
        print(f"FAIL /: Expected HTTP 200 with HTML document, got {status}", file=sys.stderr)
        sys.exit(1)
    print("PASS /")

    # 4. Check Unauthenticated API Security Gate: GET /api/accounts
    status, body, _ = make_request(f"{base_url}/api/accounts")
    if status != 401:
        print(f"FAIL /api/accounts: Expected HTTP 401 Unauthenticated without cookies, got {status}", file=sys.stderr)
        sys.exit(1)
    print("PASS /api/accounts (unauthenticated gate check)")

    # 5. Optional Authenticated User Flow
    smoke_email = os.environ.get("SMOKE_EMAIL", "").strip()
    smoke_password = os.environ.get("SMOKE_PASSWORD", "").strip()

    if smoke_email and smoke_password:
        print("Testing authenticated user flow...")
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

        login_url = f"{base_url}/api/auth/login"
        login_headers = {
            "Origin": base_url,
            "Content-Type": "application/json"
        }
        login_payload = {
            "email": smoke_email,
            "password": smoke_password
        }

        status, body, _ = make_request(login_url, method="POST", data=login_payload, headers=login_headers, opener=opener)
        if status != 200:
            print(f"FAIL login: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
            sys.exit(1)

        me_url = f"{base_url}/api/auth/me"
        status, body, _ = make_request(me_url, method="GET", opener=opener)
        if status != 200:
            print(f"FAIL /api/auth/me: Expected HTTP 200, got {status}. Body: {body}", file=sys.stderr)
            sys.exit(1)

        logout_url = f"{base_url}/api/auth/logout"
        logout_headers = {
            "Origin": base_url,
            "Content-Type": "application/json"
        }
        status, body, _ = make_request(logout_url, method="POST", data={}, headers=logout_headers, opener=opener)
        if status != 200:
            print(f"FAIL logout: Expected HTTP 200, got {status}", file=sys.stderr)
            sys.exit(1)

        print("PASS login and authenticated /api/auth/me")
        print("PASS logout")
    else:
        print("SKIP login: optional smoke credentials not configured")

    print("\nALL SMOKE TEST CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
