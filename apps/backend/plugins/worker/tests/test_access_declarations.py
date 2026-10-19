"""Worker 与任务接口访问声明。"""

from plugin_worker import register
from plugin_worker.api import router, task_router

from tests.testing.access import declared_access


def test_worker_routes_declare_expected_access():
    assert declared_access(router, task_router) == {
        "GET:/api/v1/workers": "require:worker:read",
        "GET:/api/v1/workers/all": "require:worker:read",
        "GET:/api/v1/workers/{worker_id}": "require:worker:read",
        "POST:/api/v1/workers/{worker_id}/ping": "require:worker:control",
        "POST:/api/v1/workers/{worker_id}/shutdown": "require:worker:control",
        "POST:/api/v1/workers/{worker_id}/pool/grow": "require:worker:control",
        "POST:/api/v1/workers/{worker_id}/pool/shrink": "require:worker:control",
        "POST:/api/v1/workers/{worker_id}/queues/add": "require:worker:control",
        "POST:/api/v1/workers/{worker_id}/queues/cancel": "require:worker:control",
        "GET:/api/v1/workers/{worker_id}/tasks/active": "require:worker:read",
        "GET:/api/v1/workers/{worker_id}/tasks/reserved": "require:worker:read",
        "GET:/api/v1/tasks": "require:task:read",
        "GET:/api/v1/tasks/stats/dashboard": "require:worker:read",
        "GET:/api/v1/tasks/stats/summary": "require:task:stats",
        "GET:/api/v1/tasks/stats/timeline": "require:task:stats",
        "GET:/api/v1/tasks/stats/by-name": "require:task:stats",
        "GET:/api/v1/tasks/stats/by-worker": "require:task:stats",
        "GET:/api/v1/tasks/registered": "require:task:registered",
        "GET:/api/v1/tasks/{task_id}": "require:task:read",
        "POST:/api/v1/tasks/trigger": "require:task:trigger",
        "POST:/api/v1/tasks/{task_id}/revoke": "require:task:revoke",
    }


def test_worker_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["worker", "task"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "task:stats": (),
        "task:registered": (),
        "task:read": ("task:stats", "task:registered"),
        "task:trigger": ("task:read",),
        "task:revoke": ("task:read",),
        "worker:read": ("task:stats",),
        "worker:control": ("worker:read",),
    }
