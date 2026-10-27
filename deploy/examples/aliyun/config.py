"""Example: materialize a GitLab file variable without evaluating its contents."""

import os
import shutil
import sys
from pathlib import Path

from support import HookError, main


def execute(action, context):
    if action != "materialize":
        raise HookError("Unsupported config action")
    source = Path(context["config_file"])
    if not source.is_file() or source.stat().st_size == 0:
        raise HookError("Production configuration file is missing/empty")
    destination = Path(context["bundle"]) / "runtime.env"
    shutil.copyfile(source, destination)
    os.chmod(destination, 0o600)
    return {"env_file": str(destination)}


if __name__ == "__main__":
    sys.exit(main(execute))
