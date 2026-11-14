#!/usr/bin/env python3
"""
Unit tests for Cloud Run traffic allocation verification.

Covers:
- 100% traffic allocated to target revision alone.
- 100% traffic allocated to target revision with 0% tagged entry.
- Split traffic (target < 100% and other > 0%).
- Target revision completely missing or receiving 0%.
- Invalid/missing inputs (empty service JSON, missing status, missing traffic).
- CLI execution via stdin and exit code validation.
"""

import io
import sys
import os
import json
import unittest
from unittest.mock import patch

DEPLOY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if DEPLOY_DIR not in sys.path:
    sys.path.insert(0, DEPLOY_DIR)

import verify_traffic


class TestVerifyTraffic(unittest.TestCase):

    def _build_service(self, traffic_entries):
        return {
            "apiVersion": "serving.knative.dev/v1",
            "kind": "Service",
            "metadata": {"name": "whatsss"},
            "status": {
                "traffic": traffic_entries
            }
        }

    def test_single_revision_100_percent_traffic_passes(self):
        service = self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 100}
        ])
        result = verify_traffic.verify_traffic_allocation(service, "whatsss-00005-abc")
        self.assertTrue(result["is_valid"])
        self.assertEqual(result["target_revision"], "whatsss-00005-abc")
        self.assertEqual(result["target_traffic"], 100)

    def test_target_revision_with_zero_percent_tagged_entry_passes(self):
        service = self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 100},
            {"tag": "previous", "revisionName": "whatsss-00004-old", "percent": 0}
        ])
        result = verify_traffic.verify_traffic_allocation(service, "whatsss-00005-abc")
        self.assertTrue(result["is_valid"])
        self.assertEqual(result["target_traffic"], 100)

    def test_split_traffic_raises_value_error(self):
        service = self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 80},
            {"revisionName": "whatsss-00004-old", "percent": 20}
        ])
        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation(service, "whatsss-00005-abc")
        self.assertIn("Traffic split detected", str(ctx.exception))

    def test_target_revision_missing_from_traffic_raises_value_error(self):
        service = self._build_service([
            {"revisionName": "whatsss-00004-old", "percent": 100}
        ])
        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation(service, "whatsss-00005-abc")
        self.assertTrue("Traffic split detected" in str(ctx.exception) or "does not receive 100%" in str(ctx.exception))

    def test_target_revision_receives_zero_percent_raises_value_error(self):
        service = self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 0},
            {"revisionName": "whatsss-00004-old", "percent": 100}
        ])
        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation(service, "whatsss-00005-abc")
        self.assertTrue("Traffic split detected" in str(ctx.exception) or "does not receive 100%" in str(ctx.exception))

    def test_missing_status_or_traffic_raises_value_error(self):
        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation({}, "whatsss-00005-abc")
        self.assertIn("status", str(ctx.exception).lower())

        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation({"status": {"traffic": []}}, "whatsss-00005-abc")
        self.assertIn("no traffic entries", str(ctx.exception).lower())

    def test_empty_target_revision_raises_value_error(self):
        service = self._build_service([{"revisionName": "rev-1", "percent": 100}])
        with self.assertRaises(ValueError) as ctx:
            verify_traffic.verify_traffic_allocation(service, "")
        self.assertIn("non-empty string", str(ctx.exception).lower())

    def test_cli_main_success_via_stdin(self):
        service_json = json.dumps(self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 100}
        ]))
        with patch("sys.stdin", io.StringIO(service_json)):
            with patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                with patch("sys.argv", ["verify_traffic.py", "--target-revision", "whatsss-00005-abc"]):
                    with self.assertRaises(SystemExit) as cm:
                        verify_traffic.main()
                    self.assertEqual(cm.exception.code, 0)
                    self.assertEqual(mock_stdout.getvalue().strip(), "100% -> whatsss-00005-abc")

    def test_cli_main_split_traffic_exits_nonzero(self):
        service_json = json.dumps(self._build_service([
            {"revisionName": "whatsss-00005-abc", "percent": 50},
            {"revisionName": "whatsss-00004-old", "percent": 50}
        ]))
        with patch("sys.stdin", io.StringIO(service_json)):
            with patch("sys.stderr", new_callable=io.StringIO) as mock_stderr:
                with patch("sys.argv", ["verify_traffic.py", "--target-revision", "whatsss-00005-abc"]):
                    with self.assertRaises(SystemExit) as cm:
                        verify_traffic.main()
                    self.assertEqual(cm.exception.code, 1)
                    self.assertIn("Traffic split detected", mock_stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
