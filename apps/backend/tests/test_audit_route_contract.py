from plugin_notification import register as notification_register
from plugin_schedule import register as schedule_register
from plugin_user import register as user_register


def test_business_mutations_have_explicit_actions_and_previews_are_excluded():
    expected = {
        "resend_invite": "user.resend-invite",
        "toggle_schedule": "schedule.toggle",
        "publish_announcement": "notification.publish",
    }
    for manifest in (user_register(), schedule_register(), notification_register()):
        actions = {action.code for action in manifest.audit_actions}
        for route in manifest.router.routes:
            if route.endpoint.__name__ in expected:
                value = expected[route.endpoint.__name__]
                assert route.openapi_extra["x-audit"]["action"] == value
                assert value in actions
            if route.endpoint.__name__ == "get_schedule_preview":
                assert route.openapi_extra["x-audit"] == {"exclude": True}


def test_worker_commands_are_named_and_ping_is_not_a_mutation():
    from plugin_worker import register

    manifest = register()
    for route in manifest.router.routes:
        if route.endpoint.__name__ == "shutdown_worker_endpoint":
            assert route.openapi_extra["x-audit"]["action"] == "worker.send-shutdown"
        if route.endpoint.__name__ == "ping_worker_endpoint":
            assert route.openapi_extra["x-audit"] == {"exclude": True}
