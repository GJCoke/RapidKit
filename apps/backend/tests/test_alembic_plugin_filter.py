from types import SimpleNamespace

from scripts.alembic.plugin_discovery import (
    enum_type_owners,
    object_belongs_to_plugin,
)
from sqlalchemy import Column, Enum, MetaData, String, Table


def test_table_filter_only_includes_selected_plugin_ownership() -> None:
    ownership = {"permission_roles": "permission", "script_scripts": "script"}

    assert object_belongs_to_plugin(
        SimpleNamespace(name="permission_roles"), "table", "permission", ownership
    )
    assert not object_belongs_to_plugin(
        SimpleNamespace(name="script_scripts"), "table", "permission", ownership
    )


def test_child_schema_objects_inherit_table_ownership() -> None:
    ownership = {"permission_roles": "permission"}
    column = SimpleNamespace(table=SimpleNamespace(name="permission_roles"))

    assert object_belongs_to_plugin(column, "column", "permission", ownership)


def test_shared_enum_type_has_one_deterministic_owner() -> None:
    metadata = MetaData()
    Table(
        "dept_departments",
        metadata,
        Column("status", Enum("ON", "OFF", name="status")),
    )
    Table(
        "menu_menus",
        metadata,
        Column("status", Enum("ON", "OFF", name="status")),
    )
    Table("script_scripts", metadata, Column("name", String()))

    owners = enum_type_owners(
        metadata,
        {
            "dept_departments": "department",
            "menu_menus": "menu",
            "script_scripts": "script",
        },
    )

    assert owners == {"status": "department"}
