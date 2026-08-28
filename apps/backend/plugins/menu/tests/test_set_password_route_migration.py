from importlib import import_module

import sqlalchemy as sa

OLD_LOGIN_PATH = "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat)?"
NEW_LOGIN_PATH = "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password)?"
CUSTOM_LOGIN_PATH = "/login/:module(custom-login)?"


def _connection_with_login_path(path: str) -> sa.Connection:
    engine = sa.create_engine("sqlite://")
    connection = engine.connect()
    connection.execute(sa.text("CREATE TABLE menu_menus (route_name VARCHAR NOT NULL, route_path VARCHAR NOT NULL)"))
    connection.execute(
        sa.text("INSERT INTO menu_menus (route_name, route_path) VALUES ('login', :path)"), {"path": path}
    )
    return connection


def _login_path(connection: sa.Connection) -> str:
    return connection.scalar(sa.text("SELECT route_path FROM menu_menus WHERE route_name = 'login'"))


def test_upgrade_adds_set_password_to_login_route(monkeypatch) -> None:
    migration = import_module("plugins.menu.migrations.versions.6f3a9c2d1e4b_add_set_password_to_login_route")
    connection = _connection_with_login_path(OLD_LOGIN_PATH)
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    migration.upgrade()

    assert _login_path(connection) == NEW_LOGIN_PATH


def test_downgrade_restores_previous_login_route(monkeypatch) -> None:
    migration = import_module("plugins.menu.migrations.versions.6f3a9c2d1e4b_add_set_password_to_login_route")
    connection = _connection_with_login_path(NEW_LOGIN_PATH)
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    migration.downgrade()

    assert _login_path(connection) == OLD_LOGIN_PATH


def test_upgrade_preserves_customized_login_route(monkeypatch) -> None:
    migration = import_module("plugins.menu.migrations.versions.6f3a9c2d1e4b_add_set_password_to_login_route")
    connection = _connection_with_login_path(CUSTOM_LOGIN_PATH)
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    migration.upgrade()

    assert _login_path(connection) == CUSTOM_LOGIN_PATH


def test_downgrade_preserves_customized_login_route(monkeypatch) -> None:
    migration = import_module("plugins.menu.migrations.versions.6f3a9c2d1e4b_add_set_password_to_login_route")
    connection = _connection_with_login_path(CUSTOM_LOGIN_PATH)
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    migration.downgrade()

    assert _login_path(connection) == CUSTOM_LOGIN_PATH
