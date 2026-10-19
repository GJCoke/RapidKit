"""旧脚本分支仍可解析，退役迁移只清理脚本业务数据。"""

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[1]
MIGRATION = BACKEND / "alembic/versions/20261019_retire_script.py"
pytestmark = pytest.mark.skipif(not MIGRATION.is_file(), reason="Database migration revisions are maintained locally")


def test_applied_script_revision_remains_resolvable(monkeypatch):
    monkeypatch.chdir(BACKEND)
    script = ScriptDirectory.from_config(Config("alembic.ini"))
    assert script.get_revision("58fafac99a83") is not None
    assert script.get_revision("script_retired_20261019").down_revision == "58fafac99a83"
    assert "script_retired_20261019" in script.get_heads()


@pytest.mark.asyncio
async def test_retirement_drops_scripts_and_cleans_grants_without_touching_other_data(pg_engine):
    spec = importlib.util.spec_from_file_location("script_retirement", MIGRATION)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    async with pg_engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(sa.text("CREATE SCHEMA script_retirement_check"))
            await connection.execute(sa.text("SET LOCAL search_path TO script_retirement_check"))

            def check(sync):
                metadata = sa.MetaData()
                menus = sa.Table(
                    "menu_menus",
                    metadata,
                    sa.Column("id", sa.Uuid, primary_key=True),
                    sa.Column("route_name", sa.String),
                    sa.Column("route_path", sa.String),
                    sa.Column("component", sa.String),
                    sa.Column("active_menu_id", sa.Uuid, sa.ForeignKey("menu_menus.id")),
                )
                routers = sa.Table("permission_routers", metadata, sa.Column("path", sa.String))
                extensions = sa.Table(
                    "permission_extensions",
                    metadata,
                    *(sa.Column(name, sa.String) for name in ("code", "depends_on", "resource", "route_key")),
                )
                roles = sa.Table(
                    "permission_roles",
                    metadata,
                    sa.Column("id", sa.Uuid, primary_key=True),
                    *(
                        sa.Column(name, sa.JSON)
                        for name in (
                            "permission_codes",
                            "data_scopes",
                            "field_modes",
                            "button_permissions",
                            "router_permissions",
                            "interface_permissions",
                        )
                    ),
                )
                packages = sa.Table(
                    "permission_packages",
                    metadata,
                    sa.Column("id", sa.Uuid, primary_key=True),
                    sa.Column("key", sa.String),
                    sa.Column("builtin", sa.Boolean),
                    *(sa.Column(name, sa.JSON) for name in ("codes", "data_scopes", "field_modes")),
                )
                for name in ("script_scripts", "script_executions"):
                    sa.Table(name, metadata, sa.Column("id", sa.Uuid, primary_key=True))
                metadata.create_all(sync)
                for code, dependency, resource, route in (
                    ("script:custom", None, "script", None),
                    ("user:read", "script:read", None, None),
                    ("user:read", None, None, "GET:/api/v1/scripts"),
                    ("user:read", None, None, "POST:/api/v1/scripts/{id}/execute"),
                    ("user:read", None, None, "GET:/api/v1/users"),
                ):
                    sync.execute(
                        extensions.insert(),
                        {
                            "code": code,
                            "depends_on": dependency,
                            "resource": resource,
                            "route_key": route,
                        },
                    )
                script_id, user_menu_id, role_id = uuid4(), uuid4(), uuid4()
                sync.execute(menus.insert(), {"id": script_id, "route_name": "script", "route_path": "/script"})
                sync.execute(
                    menus.insert(),
                    {
                        "id": user_menu_id,
                        "route_name": "manage_user",
                        "route_path": "/manage/user",
                        "active_menu_id": script_id,
                    },
                )
                sync.execute(
                    routers.insert(),
                    [{"path": "/api/v1/scripts"}, {"path": "/api/v1/scripts/{id}"}, {"path": "/api/v1/users"}],
                )
                scopes = {"script": "all", "user": "self_only"}
                modes = {"script": {}, "user": {"contact": "hidden"}}
                sync.execute(
                    roles.insert(),
                    {
                        "id": role_id,
                        "permission_codes": ["script:read", "user:read"],
                        "data_scopes": scopes,
                        "field_modes": modes,
                        "button_permissions": ["script:execute", "manage_user:edit"],
                        "router_permissions": ["script", "manage_user"],
                        "interface_permissions": ["POST:/api/v1/scripts/{id}/execute", "GET:/api/v1/users"],
                    },
                )
                for key, builtin in (
                    ("script.readonly", True),
                    ("script.full", True),
                    ("custom.team", False),
                    ("user.full", True),
                ):
                    sync.execute(
                        packages.insert(),
                        {
                            "id": uuid4(),
                            "key": key,
                            "builtin": builtin,
                            "codes": ["script:execute", "user:read"],
                            "data_scopes": scopes,
                            "field_modes": modes,
                        },
                    )
                for name in ("script_scripts", "script_executions"):
                    sync.execute(metadata.tables[name].insert(), {"id": uuid4()})
                with Operations.context(MigrationContext.configure(sync)):
                    migration.upgrade()
                    migration.upgrade()
                assert not {"script_scripts", "script_executions"} & set(sa.inspect(sync).get_table_names())
                remaining = sync.execute(sa.select(menus)).mappings().one()
                assert remaining["route_name"] == "manage_user" and remaining["active_menu_id"] is None
                assert sync.execute(sa.select(routers.c.path)).scalars().all() == ["/api/v1/users"]
                assert sync.execute(sa.select(extensions.c.route_key)).scalars().all() == ["GET:/api/v1/users"]
                role = sync.execute(sa.select(roles)).mappings().one()
                assert role["permission_codes"] == ["user:read"]
                assert role["button_permissions"] == ["manage_user:edit"]
                assert role["router_permissions"] == ["manage_user"]
                assert role["interface_permissions"] == ["GET:/api/v1/users"]
                rows = sync.execute(sa.select(packages)).mappings().all()
                assert {row["key"] for row in rows} == {"custom.team", "user.full"}
                assert all(row["codes"] == ["user:read"] for row in rows)
                for row in [role, *rows]:
                    assert row["data_scopes"] == {"user": "self_only"}
                    assert row["field_modes"] == {"user": {"contact": "hidden"}}

            await connection.run_sync(check)
        finally:
            await transaction.rollback()
