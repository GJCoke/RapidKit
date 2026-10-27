"""Give every worker boot a unique Celery control address."""

import os
import sys
from uuid import uuid4

from rapidkit_core.config import settings


def worker_command(group: str, arguments: list[str]) -> list[str]:
    node = f"celery@{group.replace('/', '-')}-{uuid4().hex}"
    return ["celery", "-A", "src.queues.app", "worker", "-l", "info", *arguments, "--hostname", node]


def main() -> None:
    command = worker_command(settings.CELERY_WORKER_GROUP, sys.argv[1:])
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
