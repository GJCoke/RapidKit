import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute


@pytest.mark.asyncio
async def test_validate_post_exists_alongside_deprecated_get():
    from plugin_auth.invite.api import router as invite
    from plugin_auth.password_reset.api import router as reset

    app = FastAPI()
    app.include_router(invite)
    app.include_router(reset)
    for path in ("/auth/invite/validate", "/auth/password-reset/validate"):
        routes = [route for route in app.routes if isinstance(route, APIRoute) and route.path == path]
        assert {method for route in routes for method in route.methods} == {"GET", "POST"}
        assert next(route for route in routes if "GET" in route.methods).deprecated is True
    schema = app.openapi()
    for path in ("/auth/invite/validate", "/auth/password-reset/validate"):
        assert "requestBody" in schema["paths"][path]["post"]
        assert "parameters" not in schema["paths"][path]["post"]


def test_new_credential_links_keep_token_out_of_http_query(monkeypatch):
    from plugin_auth.invite import service
    from plugin_auth.invite.config import invite_settings

    monkeypatch.setattr(invite_settings, "FRONTEND_BASE_URL", "https://app.test")
    assert service.credential_link("reset-password", "private") == "https://app.test/login/reset-password#token=private"
    monkeypatch.setattr(invite_settings, "FRONTEND_BASE_URL", "https://app.test/#/")
    assert service.credential_link("set-password", "private") == "https://app.test/#/login/set-password?token=private"
