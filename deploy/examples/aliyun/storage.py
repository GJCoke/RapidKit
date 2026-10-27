"""Example ossutil 2.2+ storage hook with round-trip SHA-256 verification."""

import os
import re
import shutil
import sys
from pathlib import Path

from support import HookError, main, read, required, run, save, sha256


def command(context):
    endpoint, region = required("OSS_ENDPOINT"), required("OSS_REGION")
    if not endpoint.startswith("https://"):
        raise HookError("OSS_ENDPOINT must use HTTPS")
    prefix = ["ossutil", "--endpoint", endpoint, "--region", region]
    mode = os.environ.get("OSS_AUTH_MODE", "Ali-EcsRamRole")
    if mode == "AK":
        identifier, secret = required("OSS_ACCESS_KEY_ID"), required("OSS_ACCESS_KEY_SECRET")
        if any("\n" in value or "\r" in value for value in (identifier, secret)):
            raise HookError("Invalid OSS credential format")
        credentials = Path(context["work_dir"]) / "oss-credentials.ini"
        credentials.parent.mkdir(parents=True, exist_ok=True)
        credentials.write_text(f"[default]\nmode=AK\naccessKeyId={identifier}\naccessKeySecret={secret}\n")
        credentials.chmod(0o600)
        prefix += ["-c", str(credentials)]
    elif mode == "Ali-EcsRamRole":
        prefix += ["--mode", mode]
    else:
        raise HookError("Unsupported OSS_AUTH_MODE")
    return prefix


def reference(context):
    bucket = required("OSS_BUCKET")
    prefix = os.environ.get("OSS_PREFIX", "rapidkit/production/predeploy").strip("/")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
        raise HookError("Invalid OSS bucket")
    if not re.fullmatch(r"[A-Za-z0-9/_-]+", prefix) or ".." in prefix.split("/"):
        raise HookError("Invalid OSS prefix")
    return f"oss://{bucket}/{prefix}/{context['release_id']}/"


def execute(action, context):
    cli = command(context)
    if action == "preflight":
        destination = reference(context)
        run([*cli, "ls", destination.rsplit("/", 2)[0] + "/"])
        return {"ready": True}
    backup = context.get("results", {}).get("database.backup")
    stored = context.get("results", {}).get("storage.put", {})
    destination = stored.get("reference") or reference(context)
    if not re.fullmatch(r"oss://[a-z0-9-]+/[A-Za-z0-9/_.-]+/", destination) or "/../" in destination:
        raise HookError("Invalid backup reference")
    work = Path(context["work_dir"])
    work.mkdir(parents=True, exist_ok=True)
    result = {"backup_id": context["release_id"], "reference": destination}
    if action == "put":
        if not backup or backup["backup_id"] != context["release_id"]:
            raise HookError("Backup identity mismatch")
        files = []
        for entry in backup["files"]:
            path = Path(entry["path"])
            if sha256(path) != entry["sha256"]:
                raise HookError("Local backup checksum mismatch")
            run([*cli, "cp", str(path), destination + path.name, "-f"])
            files.append({"name": path.name, "sha256": entry["sha256"], "size": path.stat().st_size})
        metadata = work / "backup.json"
        save(
            metadata,
            {
                "version": 1,
                "backup_id": context["release_id"],
                "files": files,
                "database": {k: v for k, v in backup.items() if k != "files"},
                "manifest": context["manifest"],
            },
        )
        run([*cli, "cp", str(metadata), destination + "backup.json", "-f"])
        return result
    if action == "verify":
        if not backup or stored.get("backup_id") != context["release_id"]:
            raise HookError("Backup identity mismatch")
        for entry in backup["files"]:
            downloaded = work / ("verify-" + Path(entry["path"]).name)
            try:
                run([*cli, "cp", destination + Path(entry["path"]).name, str(downloaded), "-f"])
                if sha256(downloaded) != entry["sha256"]:
                    raise HookError("Remote backup checksum mismatch")
            finally:
                downloaded.unlink(missing_ok=True)
        metadata = work / "verify-backup.json"
        run([*cli, "cp", destination + "backup.json", str(metadata), "-f"])
        if sha256(metadata) != sha256(work / "backup.json"):
            raise HookError("Backup metadata checksum mismatch")
        metadata.unlink()
        return {**result, "verified": True}
    if action == "commit":
        verified = context["results"].get("storage.verify", {})
        if verified.get("verified") is not True or verified.get("reference") != destination:
            raise HookError("Cannot commit an unverified backup")
        marker = work / "_COMPLETE"
        save(marker, {"backup_id": context["release_id"], "metadata_sha256": sha256(work / "backup.json")})
        run([*cli, "cp", str(marker), destination + "_COMPLETE", "-f"])
        # Retain this backup plus the latest previously confirmed local backup; failed uploads stay untouched.
        confirmed = []
        for state_path in (Path(context["root"]) / "releases").glob("*/state.json"):
            try:
                state = read(state_path)
                directory = state_path.parent / "work/backups"
                if directory.resolve() == (work / "backups").resolve():
                    continue
                if state.get("results", {}).get("storage.commit", {}).get("complete") is True and directory.is_dir():
                    confirmed.append((state_path.parent.stat().st_mtime, directory))
            except (OSError, ValueError):
                continue
        for _, directory in sorted(confirmed, reverse=True)[1:]:
            shutil.rmtree(directory)
        # Retention of remote objects is managed by the bucket, never by deployment credentials.
        return {**result, "complete": True}
    if action == "get":
        restore = work / "restore"
        restore.mkdir(mode=0o700, exist_ok=True)
        for name in ("_COMPLETE", "backup.json"):
            run([*cli, "cp", destination + name, str(restore / name), "-f"])
        marker, metadata = read(restore / "_COMPLETE"), read(restore / "backup.json")
        if marker.get("metadata_sha256") != sha256(restore / "backup.json"):
            raise HookError("Restore metadata checksum mismatch")
        if marker.get("backup_id") != metadata.get("backup_id"):
            raise HookError("Restore backup identity mismatch")
        for entry in metadata["files"]:
            name = entry["name"]
            if Path(name).name != name or name in (".", ".."):
                raise HookError("Invalid backup filename")
            run([*cli, "cp", destination + name, str(restore / name), "-f"])
            if sha256(restore / name) != entry["sha256"]:
                raise HookError("Restored backup checksum mismatch")
        return {**result, "directory": str(restore), "verified": True}
    raise HookError("Unsupported storage action")


if __name__ == "__main__":
    sys.exit(main(execute))
