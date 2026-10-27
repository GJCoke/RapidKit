"""Example SSH transport: detached target execution survives Runner/SSH disconnects."""

import json
import os
import re
import shlex
import sys
import tarfile
import time
from pathlib import Path

from support import HookError, main, required, run


def connection():
    host, user, root = required("DEPLOY_HOST"), required("DEPLOY_USER"), required("DEPLOY_ROOT")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", host) or not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        raise HookError("Invalid SSH destination")
    if not re.fullmatch(r"/[A-Za-z0-9/_-]+", root) or ".." in Path(root).parts or root == "/":
        raise HookError("DEPLOY_ROOT must be a dedicated absolute directory")
    port = os.environ.get("DEPLOY_PORT", "22")
    if not port.isdigit() or not 0 < int(port) < 65536:
        raise HookError("Invalid SSH port")
    key, known = Path(required("SSH_PRIVATE_KEY")), Path(required("SSH_KNOWN_HOSTS"))
    if not key.is_file() or not known.is_file():
        raise HookError("SSH key/known_hosts file is missing")
    key.chmod(0o600)
    common = [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={known}",
        "-o",
        "ConnectTimeout=15",
        "-i",
        str(key),
    ]
    return ["ssh", *common, "-p", port, f"{user}@{host}"], common, port, f"{user}@{host}", root


def execute(action, context):
    ssh, common, port, destination, root = connection()
    release_id = context["release_id"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", release_id):
        raise HookError("Invalid release ID")
    incoming = f"{root}/incoming/{release_id}"

    def remote(command):
        return run([*ssh, command])

    python = os.environ.get("DEPLOY_PYTHON", "python3")
    if not re.fullmatch(r"[A-Za-z0-9/_.-]+", python):
        raise HookError("Invalid remote Python command")
    cli = [python, f"{incoming}/deploy/release.py"]
    if action == "status":
        return json.loads(remote(shlex.join([*cli, "status", "--root", root, "--bundle", incoming])))
    if action != "dispatch":
        raise HookError("Unsupported transport action")
    bundle = Path(context["bundle"])
    archive = Path(context["work_dir"]) / "bundle.tar.gz"
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "w:gz") as tar:
        for path in bundle.iterdir():
            if path.name not in ("dispatch-work", "work"):
                if path.is_symlink():
                    raise HookError("Release bundle must not contain symlinks")
                tar.add(path, arcname=path.name)
    try:
        remote("umask 077; mkdir -p " + shlex.quote(root + "/incoming") + "; mkdir " + shlex.quote(incoming))
        # SCP uses SFTP by default on current OpenSSH; all remote paths were validated above.
        run(["scp", *common, "-P", port, str(archive), f"{destination}:{incoming}/bundle.tar.gz"])
        remote(shlex.join(["tar", "-xzf", incoming + "/bundle.tar.gz", "-C", incoming]))
        remote(shlex.join(["rm", "--", incoming + "/bundle.tar.gz"]))
        arguments = [*cli, "release", "--root", root, "--bundle", incoming]
        if context.get("repair_from"):
            arguments += ["--repair-from", context["repair_from"]]
        command = shlex.join(arguments)
        # nohup and redirected descriptors decouple target lifecycle from this SSH session.
        wrapper = command + '; code=$?; printf "%s" "$code" >' + shlex.quote(incoming + "/exit-code") + '; exit "$code"'
        remote(f"nohup sh -c {shlex.quote(wrapper)} >{shlex.quote(incoming + '/target.log')} 2>&1 </dev/null &")
        deadline = time.monotonic() + int(context["options"].get("wait_seconds", 3600))
        while time.monotonic() < deadline:
            try:
                state = json.loads(remote(shlex.join([*cli, "status", "--root", root, "--bundle", incoming])))
            except (HookError, ValueError):
                try:
                    remote(shlex.join(["test", "-f", incoming + "/exit-code"]))
                except HookError:
                    time.sleep(3)
                    continue
                raise HookError("Target exited before reporting status; inspect " + incoming + "/target.log") from None
            if state.get("status") == "running":
                try:
                    remote(shlex.join(["test", "-f", incoming + "/exit-code"]))
                except HookError:
                    pass
                else:
                    raise HookError("Target process exited with unfinished state; inspect status/recover")
            if state.get("status") == "success":
                return state
            if state.get("status") in ("failed", "recovered", "recovery-failed", "aborted"):
                raise HookError(
                    "Target deployment failed; inspect target status/recover (maintenance may remain active)"
                )
            time.sleep(3)
        raise HookError("Target wait timed out; target may still be running. Inspect status; do not redeploy")
    finally:
        (bundle / "credentials.json").unlink(missing_ok=True)
        archive.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main(execute))
