"""NotificationStatusCode 测试。"""

from plugin_notification.status_codes import NotificationStatusCode


def test_plugin_id_is_9():
    """Invalid notification commands use notification plugin status codes."""
    assert NotificationStatusCode.INVALID_COMMAND.plugin_id == 9


def test_codes_are_unique():
    """Each notification failure maps to one unambiguous status code."""
    codes = [code.code for code in NotificationStatusCode]
    assert len(codes) == len(set(codes))
