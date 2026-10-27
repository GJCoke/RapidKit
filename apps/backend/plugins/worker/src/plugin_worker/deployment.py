"""Explicit deployment intent; invoked by the host deployment script."""

import argparse
import asyncio
import re

from rapidkit_core.database import AsyncSessionLocal

from plugin_worker.inventory import abort_deployment, finish_deployment, prepare_deployment


def group_name(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_.-]{0,127}", value):
        raise argparse.ArgumentTypeError("Invalid worker group")
    return value


async def apply(args) -> None:
    async with AsyncSessionLocal() as session:
        if args.action == "prepare":
            await prepare_deployment(session, args.group, args.replicas, args.deployment)
        elif args.action == "finish":
            await finish_deployment(session, args.group, args.deployment)
        else:
            await abort_deployment(session, args.group, args.deployment)
        await session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "finish", "abort"))
    parser.add_argument("--group", required=True, type=group_name)
    parser.add_argument("--deployment", required=True)
    parser.add_argument("--replicas", type=int, default=1)
    args = parser.parse_args()
    if args.replicas < 0 or not 1 <= len(args.deployment) <= 64:
        parser.error("Replicas must be nonnegative; deployment IDs must contain 1–64 characters")
    asyncio.run(apply(args))


if __name__ == "__main__":
    main()
