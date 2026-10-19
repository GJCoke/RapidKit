# apps/backend/tests/test_report_unscoped.py
"""report_unscoped：列出源码中的 unscoped() 使用位置。"""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "report_unscoped.py"


def _load():
    spec = importlib.util.spec_from_file_location("report_unscoped", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_finds_usages_and_skips_tests_and_runtime(tmp_path):
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "crud.py").write_text("x = 1\nwith unscoped(self.session):\n    pass\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_x.py").write_text("with unscoped(s):\n    pass\n", encoding="utf-8")
    (tmp_path / "scope_runtime.py").write_text("def unscoped(session):\n    pass\n", encoding="utf-8")

    usages = _load().find_usages([tmp_path])

    assert [(path.name, line) for path, line, _ in usages] == [("crud.py", 2)]


def test_repository_usages_include_department_children_check():
    module = _load()
    usages = module.find_usages(module.SOURCE_DIRS)
    assert any(path.name == "crud.py" and "plugin_department" in str(path) for path, _, _ in usages)
