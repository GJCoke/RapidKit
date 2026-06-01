"""Tests for worker plugin status codes."""


class TestWorkerStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_worker.status_codes import WorkerStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(WorkerStatusCode, BaseStatusCode)

    def test_plugin_id_is_05(self):
        from plugin_worker.status_codes import WorkerStatusCode

        for code in WorkerStatusCode:
            assert code.plugin_id == 5, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_task_trigger_failed(self):
        from plugin_worker.status_codes import WorkerStatusCode

        assert WorkerStatusCode.TASK_TRIGGER_FAILED.code == 52001
        assert WorkerStatusCode.TASK_TRIGGER_FAILED.type == 2

    def test_worker_not_found(self):
        from plugin_worker.status_codes import WorkerStatusCode

        assert WorkerStatusCode.WORKER_NOT_FOUND.code == 55001
        assert WorkerStatusCode.WORKER_NOT_FOUND.type == 5

    def test_description_is_i18n_key(self):
        from plugin_worker.status_codes import WorkerStatusCode

        for code in WorkerStatusCode:
            assert code.description.startswith("worker.error."), (
                f"{code.name} description should start with 'worker.error.'"
            )
