"""Example ACR authentication and standard Docker Registry operations."""

import os
import re
import sys
import tempfile

from support import HookError, main, required, run


def execute(action, context):
    if action not in ("publish", "pull"):
        raise HookError("Unsupported registry action")
    kind = "PUSH" if action == "publish" else "PULL"
    registry = required("ACR_REGISTRY")
    username, password = required(f"ACR_{kind}_USERNAME"), required(f"ACR_{kind}_PASSWORD")
    with tempfile.TemporaryDirectory(prefix="release-acr-") as directory:
        environment = dict(os.environ, DOCKER_CONFIG=directory)
        run(
            ["docker", "login", registry, "--username", username, "--password-stdin"],
            input=password + "\n",
            env=environment,
        )
        if action == "pull":
            for image in context["manifest"]["artifacts"].values():
                if not (
                    re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", image) or re.fullmatch(r"sha256:[0-9a-f]{64}", image)
                ):
                    raise HookError("Pull requires immutable references")
                run(["docker", "pull", image], env=environment)
            return {"pulled": True}
        images = context["results"]["build.build"]["images"]
        artifacts = {}
        for name, image in images.items():
            if not image.startswith(registry + "/"):
                raise HookError("Image is outside the selected ACR registry")
            run(["docker", "push", image], env=environment)
            digest = run(
                ["docker", "buildx", "imagetools", "inspect", image, "--format", "{{.Manifest.Digest}}"],
                env=environment,
            ).strip()
            if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
                raise HookError("Registry did not return a digest")
            artifacts[name] = image.rsplit(":", 1)[0] + "@" + digest
        return {"artifacts": artifacts}


if __name__ == "__main__":
    sys.exit(main(execute))
