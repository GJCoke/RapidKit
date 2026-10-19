"""认证接口访问声明：全部为 Public / Authenticated。"""

from plugin_auth.auth.api import router as auth_router
from plugin_auth.impersonation.api import router as impersonation_router
from plugin_auth.invite.api import router as invite_router
from plugin_auth.password_reset.api import router as password_reset_router

from tests.testing.access import declared_access


def test_auth_routes_declare_expected_access():
    assert declared_access(auth_router, impersonation_router, invite_router, password_reset_router) == {
        "GET:/api/v1/auth/keys/public": "public",
        "POST:/api/v1/auth/login": "public",
        "POST:/api/v1/auth/logout": "authenticated+deny-impersonation",
        "POST:/api/v1/auth/token/refresh": "public+deny-impersonation",
        "POST:/api/v1/auth/login/swagger": "public",
        "GET:/api/v1/auth/user/info": "authenticated",
        "POST:/api/v1/auth/impersonations": "authenticated+deny-impersonation",
        "GET:/api/v1/auth/impersonations/current": "authenticated",
        "DELETE:/api/v1/auth/impersonations/current": "public",
        "GET:/api/v1/auth/invite/validate": "public",
        "POST:/api/v1/auth/invite/set-password": "public",
        "POST:/api/v1/auth/password-reset/request": "public+deny-impersonation",
        "GET:/api/v1/auth/password-reset/validate": "public+deny-impersonation",
        "POST:/api/v1/auth/password-reset/confirm": "public+deny-impersonation",
    }
