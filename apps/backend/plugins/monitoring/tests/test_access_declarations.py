"""接口监控访问声明。"""

from plugin_monitoring import register
from plugin_monitoring.api import router

from tests.testing.access import declared_access


def test_monitoring_routes_declare_expected_access():
    assert declared_access(router) == {
        "GET:/api/v1/system/stats/api/overview": "require:monitoring:read",
        "GET:/api/v1/system/stats/api/top": "require:monitoring:read",
        "GET:/api/v1/system/stats/api/distribution": "require:monitoring:read",
        "GET:/api/v1/system/stats/api/trend": "require:monitoring:read",
        "GET:/api/v1/system/stats/api/list": "require:monitoring:read",
    }


def test_monitoring_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["monitoring"]
    assert [c.code for c in manifest.permission_codes] == ["monitoring:read"]
