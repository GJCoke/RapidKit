"""Unit tests for audit collection boundaries and sanitization."""

from src.middlewares.audit import _build_audit_record, _is_excluded_path, _sanitize_mapping


def test_refresh_token_endpoint_is_excluded_from_audit():
    assert _is_excluded_path("/api/v1/auth/refreshToken") is True


def test_sensitive_values_are_removed_recursively():
    sanitized = _sanitize_mapping(
        {
            "username": "coke",
            "password": "plain-secret",
            "profile": {
                "displayName": "Coke",
                "refreshToken": "jwt-value",
                "verificationCode": "123456",
            },
            "items": [{"name": "safe", "apiKey": "key-value"}],
        }
    )
    assert sanitized == {
        "username": "coke",
        "profile": {"displayName": "Coke"},
        "items": [{"name": "safe"}],
    }


def test_audit_record_uses_technical_audit_shape():
    record = _build_audit_record(
        method="POST",
        path="/api/v1/users",
        actor_id=None,
        actor_name="admin",
        ip="127.0.0.1",
        user_agent="pytest",
        request_summary={"name": "Alice"},
        response_code=1000,
        http_status=200,
    )
    assert record["action"] == "users.create"
    assert record["result"] == "success"
    assert record["resource_type"] == "users"
    assert "event_type" not in record
    assert "request_body" not in record
