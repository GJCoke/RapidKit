# apps/backend/scripts/report_unscoped.py
"""
列出源码中 ``unscoped(`` 的使用位置，供代码评审检查（退出码恒为 0）。

Usage:
    uv run python scripts/report_unscoped.py

Author : Coke
Date   : 2026-10-19
"""

import re
import sys
from collections.abc import Iterable
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[1]
SOURCE_DIRS = (BACKEND_ROOT / "plugins", BACKEND_ROOT / "src", REPO_ROOT / "packages")
PATTERN = re.compile(r"\bunscoped\(")
SKIPPED_PARTS = {"tests", "node_modules", ".venv", "__pycache__"}


def find_usages(roots: Iterable[Path]) -> list[tuple[Path, int, str]]:
    """返回 (文件, 行号, 行内容)；跳过测试目录与运行时自身的定义。"""
    usages: list[tuple[Path, int, str]] = []
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            if SKIPPED_PARTS & set(path.relative_to(root).parts) or path.name == "scope_runtime.py":
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if PATTERN.search(line):
                    usages.append((path, number, line.strip()))
    return usages


def main() -> int:
    usages = find_usages(SOURCE_DIRS)
    print(f"unscoped() usages: {len(usages)}")
    for path, number, line in usages:
        print(f"{path.relative_to(REPO_ROOT)}:{number}: {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
