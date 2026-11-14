#!/usr/bin/env python3
"""
Cloud Run Revision APP_COMMIT_SHA Extractor.

Extracts and validates APP_COMMIT_SHA from a Cloud Run revision JSON definition.
Ensures that exactly one container defines APP_COMMIT_SHA, that its value is
a valid 40-character lowercase hexadecimal Git commit SHA, and optionally
compares it against the expected commit SHA.
"""

import sys
import json
import re
import argparse

SHA_REGEX = re.compile(r"^[0-9a-f]{40}$")


def extract_app_commit_sha(revision_data, expected_sha=None):
    """
    Extract and validate APP_COMMIT_SHA from Cloud Run revision data.

    :param revision_data: dict or JSON string representing the revision object.
    :param expected_sha: optional expected 40-char lowercase hex commit SHA.
    :return: str, the validated 40-character commit SHA.
    :raises ValueError: if extraction or validation fails.
    """
    if isinstance(revision_data, (str, bytes)):
        try:
            data = json.loads(revision_data)
        except Exception as e:
            raise ValueError(f"Invalid JSON provided for revision: {e}") from e
    elif isinstance(revision_data, dict):
        data = revision_data
    else:
        raise ValueError(f"Revision data must be a dict or JSON string (got {type(revision_data).__name__}).")

    if not isinstance(data, dict):
        raise ValueError("Parsed revision JSON must be an object/dict.")

    spec = data.get("spec")
    if not isinstance(spec, dict):
        raise ValueError("Revision JSON is missing valid 'spec' object.")

    containers = spec.get("containers")
    if not isinstance(containers, list) or len(containers) == 0:
        raise ValueError("Revision 'spec' contains no containers.")

    found_entries = []
    for c_idx, container in enumerate(containers):
        if not isinstance(container, dict):
            continue
        env_list = container.get("env")
        if not isinstance(env_list, list):
            continue
        for e_idx, env_item in enumerate(env_list):
            if not isinstance(env_item, dict):
                continue
            if env_item.get("name") == "APP_COMMIT_SHA":
                found_entries.append({
                    "container_index": c_idx,
                    "env_index": e_idx,
                    "value": env_item.get("value")
                })

    if len(found_entries) == 0:
        raise ValueError("APP_COMMIT_SHA environment variable is missing from all containers.")

    if len(found_entries) > 1:
        details = ", ".join(f"container[{e['container_index']}]" for e in found_entries)
        raise ValueError(f"Duplicate APP_COMMIT_SHA environment variable found ({len(found_entries)} occurrences in {details}). Exactly one is required.")

    val = found_entries[0]["value"]

    if val is None or not isinstance(val, str) or not val.strip():
        raise ValueError("APP_COMMIT_SHA environment variable value is empty or not a string.")

    if not SHA_REGEX.match(val):
        raise ValueError(f"APP_COMMIT_SHA must be exactly 40 lowercase hexadecimal characters (got: '{val}').")

    if expected_sha is not None:
        if not isinstance(expected_sha, str) or not SHA_REGEX.match(expected_sha):
            raise ValueError(f"Expected SHA must be exactly 40 lowercase hexadecimal characters (got: '{expected_sha}').")
        if val != expected_sha:
            raise ValueError(f"APP_COMMIT_SHA mismatch! Expected '{expected_sha}', but revision has '{val}'.")

    return val


def main():
    parser = argparse.ArgumentParser(description="Extract and validate APP_COMMIT_SHA from Cloud Run revision JSON.")
    parser.add_argument("file", nargs="?", help="Path to revision JSON file (defaults to reading from stdin).")
    parser.add_argument("-e", "--expected-sha", help="Expected 40-character lowercase hex commit SHA.")
    args = parser.parse_args()

    try:
        if args.file and args.file != "-":
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            content = sys.stdin.read()

        if not content or not content.strip():
            print("ERROR: Empty revision JSON input.", file=sys.stderr)
            sys.exit(1)

        extracted_sha = extract_app_commit_sha(content, expected_sha=args.expected_sha)
        print(extracted_sha)
        sys.exit(0)
    except ValueError as ve:
        print(f"ERROR: {ve}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"ERROR: Unexpected error extracting APP_COMMIT_SHA: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
