from alembic.operations.ops import UpgradeOps
from scripts.alembic.enum_changes import (
    append_enum_value_ops,
    autogenerate_enum_value_ops,
    collect_model_enums,
    compare_enum_values,
    load_database_enums,
    render_add_enum_value_sql,
)
from sqlalchemy import Column, Enum, MetaData, Table


def _status_metadata(*values: str) -> MetaData:
    metadata = MetaData()
    Table("user_users", metadata, Column("status", Enum(*values, name="status")))
    return metadata


def test_appended_enum_value_is_assigned_to_table_plugin() -> None:
    definitions = collect_model_enums(
        _status_metadata("ON", "OFF", "PENDING"),
        {"user_users": "user"},
    )

    changes, errors = compare_enum_values(
        definitions,
        {(None, "status"): ("ON", "OFF")},
    )

    assert errors == []
    assert [(change.owner, change.name, change.value, change.before) for change in changes] == [
        ("user", "status", "PENDING", None),
    ]
    assert render_add_enum_value_sql(changes[0]) == ("ALTER TYPE \"status\" ADD VALUE IF NOT EXISTS 'PENDING'")


def test_inserted_enum_value_is_rendered_before_next_existing_value() -> None:
    definitions = collect_model_enums(
        _status_metadata("ON", "PENDING", "OFF"),
        {"user_users": "user"},
    )

    changes, errors = compare_enum_values(
        definitions,
        {(None, "status"): ("ON", "OFF")},
    )

    assert errors == []
    assert render_add_enum_value_sql(changes[0]) == (
        "ALTER TYPE \"status\" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'OFF'"
    )


def test_shared_enum_has_one_deterministic_plugin_owner() -> None:
    metadata = MetaData()
    Table("user_users", metadata, Column("status", Enum("ON", "OFF", "PENDING", name="status")))
    Table("menu_menus", metadata, Column("status", Enum("ON", "OFF", "PENDING", name="status")))

    definitions = collect_model_enums(
        metadata,
        {"user_users": "user", "menu_menus": "menu"},
    )

    assert definitions[(None, "status")].owner == "menu"


def test_removed_or_reordered_values_are_reported_as_errors() -> None:
    definitions = collect_model_enums(
        _status_metadata("OFF", "ON"),
        {"user_users": "user"},
    )

    changes, errors = compare_enum_values(
        definitions,
        {(None, "status"): ("ON", "OFF", "PENDING")},
    )

    assert changes == []
    assert len(errors) == 1
    assert "removed values: PENDING" in errors[0]
    assert "reordered existing values" in errors[0]


def test_enum_missing_from_database_is_left_to_table_autogeneration() -> None:
    definitions = collect_model_enums(
        _status_metadata("ON", "OFF"),
        {"user_users": "user"},
    )

    changes, errors = compare_enum_values(definitions, {})

    assert changes == []
    assert errors == []


def test_database_enum_reader_normalizes_default_schema() -> None:
    class Inspector:
        default_schema_name = "public"

        def get_enums(self, *, schema: str) -> list[dict[str, object]]:
            assert schema == "*"
            return [
                {"schema": "public", "name": "status", "labels": ["ON", "OFF"]},
                {"schema": "audit", "name": "event", "labels": ["CREATED"]},
            ]

    assert load_database_enums(Inspector()) == {
        (None, "status"): ("ON", "OFF"),
        ("audit", "event"): ("CREATED",),
    }


def test_alembic_ops_only_include_changes_owned_by_selected_plugin() -> None:
    changes = compare_enum_values(
        collect_model_enums(
            _status_metadata("ON", "OFF", "PENDING"),
            {"user_users": "user"},
        ),
        {(None, "status"): ("ON", "OFF")},
    )[0]
    upgrade_ops = UpgradeOps([])

    append_enum_value_ops(upgrade_ops, changes, "menu")
    assert upgrade_ops.ops == []

    append_enum_value_ops(upgrade_ops, changes, "user")
    assert len(upgrade_ops.ops) == 1
    assert upgrade_ops.ops[0].sqltext == ("ALTER TYPE \"status\" ADD VALUE IF NOT EXISTS 'PENDING'")


def test_autogenerate_adds_enum_sql_for_selected_plugin() -> None:
    class Inspector:
        default_schema_name = "public"

        def get_enums(self, *, schema: str) -> list[dict[str, object]]:
            return [{"schema": "public", "name": "status", "labels": ["ON", "OFF"]}]

    upgrade_ops = UpgradeOps([])

    autogenerate_enum_value_ops(
        metadata=_status_metadata("ON", "OFF", "PENDING"),
        table_to_plugin={"user_users": "user"},
        inspector=Inspector(),
        upgrade_ops=upgrade_ops,
        plugin_name="user",
    )

    assert [operation.sqltext for operation in upgrade_ops.ops] == [
        "ALTER TYPE \"status\" ADD VALUE IF NOT EXISTS 'PENDING'",
    ]


def test_generated_enum_operation_can_build_safe_downgrade() -> None:
    changes = compare_enum_values(
        collect_model_enums(
            _status_metadata("ON", "OFF", "PENDING"),
            {"user_users": "user"},
        ),
        {(None, "status"): ("ON", "OFF")},
    )[0]
    upgrade_ops = UpgradeOps([])
    append_enum_value_ops(upgrade_ops, changes, "user")

    downgrade_ops = upgrade_ops.reverse()

    assert len(downgrade_ops.ops) == 1
    assert downgrade_ops.ops[0].change == changes[0]
