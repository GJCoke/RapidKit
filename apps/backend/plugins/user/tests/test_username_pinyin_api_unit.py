"""Database-independent tests for the username pinyin API contract."""

from unittest.mock import patch

from plugin_user.api import _warn_username_pinyin_mismatch, validate_username_pinyin
from plugin_user.schemas import UsernamePinyinValidationRequest


async def test_validate_username_pinyin_returns_camel_case_response():
    response = await validate_username_pinyin(UsernamePinyinValidationRequest(name="张三", username="zhangsan1"))

    assert response.data.suggested_username == "zhangsan"
    assert response.data.consistent is False
    assert response.model_dump(by_alias=True)["data"] == {
        "suggestedUsername": "zhangsan",
        "consistent": False,
    }


async def test_validate_username_pinyin_accepts_empty_username_for_suggestion():
    response = await validate_username_pinyin(UsernamePinyinValidationRequest(name="张三"))

    assert response.data.suggested_username == "zhangsan"
    assert response.data.consistent is False


def test_mismatch_warning_is_non_blocking_and_privacy_safe():
    with patch("plugin_user.api.logger") as logger:
        _warn_username_pinyin_mismatch(operation="update", name="张三", username="custom")

    logger.bind.assert_called_once_with(operation="update", target_user_id=None, pinyin_mismatch=True)
    logger.bind.return_value.warning.assert_called_once_with("Username does not match the canonical name pinyin")


def test_matching_username_does_not_warn():
    with patch("plugin_user.api.logger") as logger:
        _warn_username_pinyin_mismatch(operation="create", name="张三", username="zhangsan")

    logger.bind.assert_not_called()
