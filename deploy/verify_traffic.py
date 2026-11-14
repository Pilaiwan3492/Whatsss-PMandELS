#!/usr/bin/env python3
"""
Cloud Run Traffic Allocation Verifier.

Verifies that:
1. Target revision receives exactly 100% traffic across all status.traffic entries.
2. No other revision receives > 0% traffic.
3. No traffic split exists routing any user to another revision.
"""

import sys
import json
import argparse


def verify_traffic_allocation(service_data, target_revision):
    """
    Verifies that target_revision receives exactly 100% of traffic
    and all other revisions receive 0%.

    :param service_data: dict or JSON string of Cloud Run service description
    :param target_revision: name of target revision expected to have 100% traffic
    :return: dict with summary {"target_revision": str, "target_traffic": int, "is_valid": bool}
    :raises ValueError: if validation fails
    """
    if isinstance(service_data, (str, bytes)):
        try:
            data = json.loads(service_data)
        except Exception as e:
            raise ValueError(f"Invalid JSON provided for service: {e}") from e
    elif isinstance(service_data, dict):
        data = service_data
    else:
        raise ValueError(f"Service data must be a dict or JSON string (got {type(service_data).__name__}).")

    if not isinstance(data, dict):
        raise ValueError("Parsed service JSON must be an object/dict.")

    if not target_revision or not isinstance(target_revision, str) or not target_revision.strip():
        raise ValueError("target_revision must be a non-empty string.")

    target_revision = target_revision.strip()

    status = data.get("status")
    if not isinstance(status, dict):
        raise ValueError("Service JSON is missing valid 'status' object.")

    traffic_entries = status.get("traffic")
    if not isinstance(traffic_entries, list) or len(traffic_entries) == 0:
        raise ValueError("Service 'status' contains no traffic entries.")

    target_traffic = 0
    other_traffic = 0
    other_revisions = {}

    for entry in traffic_entries:
        if not isinstance(entry, dict):
            continue
        percent = entry.get("percent", 0)
        rev = entry.get("revisionName")
        if rev == target_revision:
            target_traffic += percent
        else:
            if percent > 0:
                other_traffic += percent
                other_revisions[rev] = other_revisions.get(rev, 0) + percent

    if other_traffic > 0:
        raise ValueError(
            f"Traffic split detected! Target revision '{target_revision}' receives {target_traffic}%, while other revisions receive {other_traffic}%: {other_revisions}."
        )

    if target_traffic != 100:
        raise ValueError(
            f"Target revision '{target_revision}' does not receive 100% traffic (receives {target_traffic}%)."
        )

    return {
        "target_revision": target_revision,
        "target_traffic": target_traffic,
        "is_valid": True
    }


def main():
    parser = argparse.ArgumentParser(description="Verify Cloud Run traffic allocation.")
    parser.add_argument("file", nargs="?", help="Path to service JSON file (defaults to stdin).")
    parser.add_argument("-r", "--target-revision", required=True, help="Target revision expected to have 100% traffic.")
    args = parser.parse_args()

    try:
        if args.file and args.file != "-":
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            content = sys.stdin.read()

        if not content or not content.strip():
            print("ERROR: Empty service JSON input.", file=sys.stderr)
            sys.exit(1)

        result = verify_traffic_allocation(content, args.target_revision)
        print(f"100% -> {result['target_revision']}")
        sys.exit(0)
    except ValueError as ve:
        print(f"ERROR: {ve}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"ERROR: Unexpected error verifying traffic: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
