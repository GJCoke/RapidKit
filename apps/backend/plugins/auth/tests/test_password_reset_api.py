def test_password_reset_router_exposes_three_public_paths() -> None:
    from plugin_auth.password_reset.api import router

    paths = {route.path for route in router.routes}

    assert paths == {
        "/auth/password-reset/request",
        "/auth/password-reset/validate",
        "/auth/password-reset/confirm",
    }
