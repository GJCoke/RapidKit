"""
导出未受权限码保护的接口清单（Public / Authenticated），供评审使用。

用法（在 apps/backend 下）::

    uv run python -m scripts.export_route_access route-access.md

Author : Coke
Date   : 2026-10-17
"""

import asyncio
import sys
from importlib import import_module
from pathlib import Path

from fastapi.routing import APIRoute
from plugin_permission.utils import build_route_key
from rapidkit_common.access import inspect_route_access


async def collect_rows() -> list[tuple[str, str, bool]]:
    """返回 ``(路由键, 声明, 是否禁止模拟登录)``，仅含 Public 与 Authenticated。"""
    app = import_module("src.main").app
    rows: list[tuple[str, str, bool]] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        accesses = inspect_route_access(route)
        if len(accesses) == 1 and accesses[0].kind in ("public", "authenticated"):
            rows.append(
                (build_route_key(route.methods, route.path), str(accesses[0].kind), accesses[0].deny_impersonation)
            )
    return sorted(rows, key=lambda row: (row[1], row[0]))


def render(rows: list[tuple[str, str, bool]]) -> str:
    """渲染为 Markdown 表格。"""
    lines = ["| 接口 | 声明 | 禁止模拟登录 |", "|---|---|---|"]
    lines.extend(f"| `{key}` | {kind} | {'是' if deny else ''} |" for key, kind, deny in rows)
    return "\n".join(lines) + "\n"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m scripts.export_route_access <output.md>")
    output = Path(sys.argv[1])
    output.write_text(render(asyncio.run(collect_rows())), encoding="utf-8")


if __name__ == "__main__":
    main()
