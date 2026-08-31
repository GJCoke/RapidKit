from src._menu_seeds import build_menus


def test_login_seed_includes_password_setup_and_reset_modules() -> None:
    login = next(menu for menu in build_menus() if menu.route_name == "login")

    assert login.route_path == (
        "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password|reset-password)?"
    )
