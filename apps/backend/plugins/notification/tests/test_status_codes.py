"""NotificationStatusCode 测试。"""

from pathlib import Path

import pytest
from plugin_notification.status_codes import NotificationStatusCode
from src.locales.i18n import I18n
from src.locales.utils import load_and_flatten_locales


def test_plugin_id_is_9():
    """Invalid notification commands use notification plugin status codes."""
    assert NotificationStatusCode.INVALID_COMMAND.plugin_id == 9


def test_codes_are_unique():
    """Each notification failure maps to one unambiguous status code."""
    codes = [code.code for code in NotificationStatusCode]
    assert len(codes) == len(set(codes))


@pytest.mark.parametrize(
    ("name", "code", "description"),
    [
        ("TEMPLATE_NOT_FOUND", 92010, "notification.error.templateNotFound"),
        ("TEMPLATE_DISABLED", 92011, "notification.error.templateDisabled"),
        ("TEMPLATE_VARIABLE_INVALID", 92012, "notification.error.templateVariableInvalid"),
        ("CONTENT_HTML_NOT_ALLOWED", 92013, "notification.error.contentHtmlNotAllowed"),
        ("TEMPLATE_CODE_EXISTS", 92014, "notification.error.templateCodeExists"),
        ("CATEGORY_NOT_CLOSABLE", 92020, "notification.error.categoryNotClosable"),
        ("CATEGORY_RESERVED", 92021, "notification.error.categoryReserved"),
        ("MESSAGE_NOT_PUBLISHABLE", 93010, "notification.error.messageNotPublishable"),
        ("MESSAGE_NOT_CANCELLABLE", 93011, "notification.error.messageNotCancellable"),
        ("MESSAGE_NOT_RECALLABLE", 93012, "notification.error.messageNotRecallable"),
        ("SCHEDULE_NOT_DUE", 93013, "notification.error.scheduleNotDue"),
    ],
)
def test_template_and_lifecycle_status_codes(name, code, description):
    status = getattr(NotificationStatusCode, name)

    assert status.code == code
    assert status.description == description


def test_template_and_lifecycle_status_codes_have_bilingual_messages():
    locales_root = Path(__file__).resolve().parents[3] / "src" / "locales" / "langs"
    expected_keys = {
        "notification.error.templateNotFound",
        "notification.error.templateDisabled",
        "notification.error.templateVariableInvalid",
        "notification.error.contentHtmlNotAllowed",
        "notification.error.templateCodeExists",
        "notification.error.categoryNotClosable",
        "notification.error.categoryReserved",
        "notification.category.adminAnnouncement",
        "notification.category.systemSecurity",
        "notification.category.userInvited",
        "notification.category.userMention",
        "notification.category.taskCompleted",
        "notification.error.messageNotPublishable",
        "notification.error.messageNotCancellable",
        "notification.error.messageNotRecallable",
        "notification.error.scheduleNotDue",
    }

    loaded = load_and_flatten_locales(locales_root)
    for locale in ("zh-CN", "en-US"):
        messages = loaded[locale]
        assert expected_keys <= messages.keys()
        assert all(messages[key] for key in expected_keys)


@pytest.mark.parametrize(
    "locale,expected",
    [("zh-CN", "模板变量不符合声明约束"), ("en-US", "Template variables violate declared schema")],
)
def test_template_variable_error_translates_through_application_loader(locale, expected):
    assert I18n().t(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID.description, language=locale) == expected
