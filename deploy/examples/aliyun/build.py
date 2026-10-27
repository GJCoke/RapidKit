"""Example Docker build hook. Does not receive production runtime secrets."""

import shutil
import sys
from pathlib import Path

from support import HookError, main, required, run


def execute(action, context):
    if action != "build":
        raise HookError("Unsupported build action")
    production = Path(context["bundle"]) / "docker/prod"
    production.mkdir(parents=True)
    for name in ("docker-compose.yml", "nginx.conf"):
        shutil.copy2(Path(context["source_root"]) / "docker/prod" / name, production / name)
    images = {}
    for name, dockerfile in (("backend", "docker/backend/Dockerfile"), ("frontend", "docker/frontend/Dockerfile")):
        repository = required(f"ACR_{name.upper()}_REPOSITORY")
        image = f"{repository}:{context['release_id']}"
        command = ["docker", "build", "--file", str(Path(context["source_root"]) / dockerfile), "--tag", image]
        if name == "backend":
            command += ["--target", "prod"]
        command += [
            "--label",
            f"org.opencontainers.image.revision={context['manifest']['commit']}",
            "--label",
            f"org.opencontainers.image.version={context['manifest']['tag']}",
            context["source_root"],
        ]
        run(command)
        images[name] = image
    return {"images": images}


if __name__ == "__main__":
    sys.exit(main(execute))
