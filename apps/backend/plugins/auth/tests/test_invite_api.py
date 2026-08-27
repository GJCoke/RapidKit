def test_invite_router_paths_registered() -> None:
    from plugin_auth.invite.api import router

    paths = {route.path for route in router.routes}
    assert "/auth/invite/validate" in paths
    assert "/auth/invite/set-password" in paths
