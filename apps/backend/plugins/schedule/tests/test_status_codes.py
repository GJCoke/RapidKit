"""Tests for schedule plugin status codes."""


class TestScheduleStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_schedule.status_codes import ScheduleStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(ScheduleStatusCode, BaseStatusCode)

    def test_plugin_id_is_07(self):
        from plugin_schedule.status_codes import ScheduleStatusCode

        for code in ScheduleStatusCode:
            assert code.plugin_id == 7, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_interval_data_required(self):
        from plugin_schedule.status_codes import ScheduleStatusCode

        assert ScheduleStatusCode.INTERVAL_DATA_REQUIRED.code == 71001
        assert ScheduleStatusCode.INTERVAL_DATA_REQUIRED.type == 1

    def test_task_not_found(self):
        from plugin_schedule.status_codes import ScheduleStatusCode

        assert ScheduleStatusCode.TASK_NOT_FOUND.code == 75001
        assert ScheduleStatusCode.TASK_NOT_FOUND.type == 5

    def test_description_is_i18n_key(self):
        from plugin_schedule.status_codes import ScheduleStatusCode

        for code in ScheduleStatusCode:
            assert code.description.startswith("schedule.error."), (
                f"{code.name} description should start with 'schedule.error.'"
            )
