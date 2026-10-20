"""内置功能包声明完整性测试：使用真实加载的应用与目录。"""

import pytest
from plugin_permission.catalog.registry import build_catalog, get_catalog, set_catalog
from plugin_permission.catalog.route_check import collect_route_bindings
from plugin_permission.package.services import collect_builtin_packages

EXPECTED_KEYS = {
    f"{resource}.{kind}"
    for resource in (
        "user",
        "role",
        "menu",
        "department",
        "worker",
        "task",
        "schedule",
    )
    for kind in ("readonly", "full")
}


@pytest.fixture
def started_app(loaded_app):
    try:
        previous = get_catalog()
    except RuntimeError:
        previous = None
    set_catalog(build_catalog(loaded_app.state.plugins, collect_route_bindings(loaded_app.routes)))
    try:
        yield loaded_app
    finally:
        set_catalog(previous)


def test_builtin_packages_cover_all_resources(started_app):
    manifests = started_app.state.plugins
    loaded = {manifest.name for manifest in manifests}
    expected = set(EXPECTED_KEYS)
    if "worker" not in loaded:
        expected -= {"worker.readonly", "worker.full", "task.readonly", "task.full"}
    if "schedule" not in loaded:
        expected -= {"schedule.readonly", "schedule.full"}

    packages = {package.key: package for package in collect_builtin_packages(manifests)}

    assert set(packages) == expected
    catalog = get_catalog()
    for package in packages.values():
        assert all(code in catalog.codes for code in package.codes)
        resource = package.key.split(".")[0]
        assert f"{resource}:read" in package.codes
