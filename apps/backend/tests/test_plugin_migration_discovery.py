from pathlib import Path

import pytest
from scripts.alembic.plugin_discovery import (
    PluginDiscoveryError,
    discover_migration_plugins,
)


@pytest.fixture(autouse=True)
def backend_working_directory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(Path(__file__).resolve().parents[1])


def test_dynamic_discovery_uses_entry_point_identity() -> None:
    result = discover_migration_plugins(Path("plugins"))
    plugin = result.plugins["permission"]

    assert plugin.directory_name == "permission"
    assert plugin.module == "plugin_permission"
    assert plugin.version_path == "plugins/permission/migrations/versions"
    assert result.table_to_plugin[plugin.tables[0]] == "permission"


def test_dynamic_discovery_includes_all_local_model_plugins() -> None:
    result = discover_migration_plugins(Path("plugins"))

    assert {"permission", "department", "script"} <= result.plugins.keys()


def test_duplicate_table_ownership_is_rejected() -> None:
    with pytest.raises(PluginDiscoveryError, match="owned by multiple plugins"):
        discover_migration_plugins(
            Path("plugins"),
            table_overrides={"script": ["shared_table"], "permission": ["shared_table"]},
        )
