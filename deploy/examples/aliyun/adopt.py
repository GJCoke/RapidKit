#!/usr/bin/env python3
"""Explicit one-time adoption of an existing Compose installation; never creates infrastructure."""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--release-id", required=True)
    args = parser.parse_args()
    if not args.env_file.is_file() or not args.profile.is_file():
        parser.error("Existing runtime env file and explicit profile are required")
    bundle = args.root.resolve() / "incoming" / args.release_id
    # Let the core validate IDs before any path derived from them is created.
    if (
        not args.release_id
        or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-" for c in args.release_id)
        or args.release_id in (".", "..")
    ):
        parser.error("Invalid release ID")
    bundle.mkdir(parents=True, mode=0o700, exist_ok=False)
    shutil.copytree(
        args.source_root / "deploy", bundle / "deploy", ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc")
    )
    (bundle / "docker/prod").mkdir(parents=True)
    for name in ("docker-compose.yml", "nginx.conf"):
        shutil.copy2(args.source_root / "docker/prod" / name, bundle / "docker/prod" / name)
    shutil.copyfile(args.profile, bundle / "profile.json")
    shutil.copyfile(args.env_file, bundle / "runtime.env")
    (bundle / "manifest.json").write_text(
        json.dumps(
            {"version": 1, "release_id": args.release_id, "tag": "adopted", "commit": "existing", "artifacts": {}}
        )
    )
    return subprocess.run(
        [
            sys.executable,
            str(bundle / "deploy/release.py"),
            "adopt",
            "--root",
            str(args.root.resolve()),
            "--bundle",
            str(bundle),
        ],
        check=False,
    ).returncode


if __name__ == "__main__":
    sys.exit(main())
