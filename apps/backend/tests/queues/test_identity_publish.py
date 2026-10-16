"""Every Celery publication entry point must preserve trusted identity."""

from unittest.mock import patch

import pytest
from celery import Celery as BaseCelery
from rapidkit_framework.identity import IdentityMetadata, identity_headers, identity_scope
from src.queues.celery import Celery


@pytest.mark.parametrize(
    "metadata", [IdentityMetadata(), IdentityMetadata("user", "user"), IdentityMetadata("subject", "actor", "session")]
)
def test_send_task_carries_identity_and_strips_reserved_overrides(metadata):
    app = Celery("publisher-test", broker="memory://")
    supplied = {
        "user_id": "forged",
        "actor_id": "forged",
        "impersonation_session_id": "forged",
        "correlation_id": "trace",
    }
    with identity_scope(metadata), patch.object(BaseCelery, "send_task", return_value="queued") as parent:
        assert app.send_task("example", [1], {"value": 2}, headers=supplied, countdown=3) == "queued"
    assert parent.call_args.args == ("example", [1], {"value": 2})
    assert parent.call_args.kwargs == {
        "headers": {"correlation_id": "trace", **identity_headers(metadata)},
        "countdown": 3,
    }
    assert supplied["actor_id"] == "forged"
