"""
Integration test: verify plugin isolation rules.

Ensures no cross-plugin imports exist in the framework/core/middleware layers,
and that plugins only communicate through protocols and the ServiceRegistry.

Author : Coke
Date   : 2026-05-11
"""

import ast
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def _collect_plugin_imports(file_path: Path) -> list[str]:
    """Extract all `from plugin_*` import statements from a Python file."""
    try:
        tree = ast.parse(file_path.read_text())
    except SyntaxError:
        return []

    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            if node.module.startswith("plugin_"):
                violations.append(f"{file_path.relative_to(BASE)}:{node.lineno} imports {node.module}")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("plugin_"):
                    violations.append(f"{file_path.relative_to(BASE)}:{node.lineno} imports {alias.name}")
    return violations


def test_middleware_no_plugin_imports():
    """Middleware layer must not import any plugin directly."""
    middleware_dir = BASE / "src" / "middlewares"
    violations = []
    for py_file in middleware_dir.rglob("*.py"):
        violations.extend(_collect_plugin_imports(py_file))
    assert violations == [], "Middleware imports plugins:\n" + "\n".join(violations)


def test_sio_no_plugin_imports():
    """Socket.IO layer must not import any plugin directly."""
    sio_dir = BASE / "src" / "sio"
    violations = []
    for py_file in sio_dir.rglob("*.py"):
        violations.extend(_collect_plugin_imports(py_file))
    assert violations == [], "SIO imports plugins:\n" + "\n".join(violations)


def test_main_no_plugin_imports():
    """Main app entry must not import any plugin directly."""
    main_file = BASE / "src" / "main.py"
    violations = _collect_plugin_imports(main_file)
    assert violations == [], "main.py imports plugins:\n" + "\n".join(violations)


def test_service_registry_protocols_importable():
    """All cross-plugin protocols must be importable from rapidkit_common.protocols."""
    from rapidkit_common.protocols import (
        Authenticator,
        CurrentUserProvider,
        DepartmentResolver,
        PermissionChecker,
        PolicyLoader,
        TokenDecoder,
        UserProtocol,
        UserQueryService,
        UserResolver,
    )

    assert all(
        p is not None
        for p in [
            Authenticator,
            CurrentUserProvider,
            DepartmentResolver,
            PermissionChecker,
            PolicyLoader,
            TokenDecoder,
            UserProtocol,
            UserQueryService,
            UserResolver,
        ]
    )


def test_service_registry_basic():
    """ServiceRegistry can register and retrieve services."""
    from rapidkit_framework.services import ServiceRegistry

    registry = ServiceRegistry()

    class FakeProtocol:
        pass

    class FakeImpl:
        pass

    impl = FakeImpl()
    registry.register(FakeProtocol, impl)
    assert registry.get(FakeProtocol) is impl
    assert registry.get_optional(FakeProtocol) is impl
    registry.clear()
    assert registry.get_optional(FakeProtocol) is None
