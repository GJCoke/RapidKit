"""Event definition tests."""

from rapidkit_common.events import (
    DepartmentDeletedEvent,
    MenuChangedEvent,
    RoleDeletedEvent,
    RolePermissionsChangedEvent,
    ScheduleCreatedEvent,
    ScheduleDeletedEvent,
    ScheduleToggledEvent,
    ScriptExecutedEvent,
    UserCreatedEvent,
    UserDeletedEvent,
    UserLoginEvent,
    UserLogoutEvent,
    UserPasswordChangedEvent,
    UserRolesChangedEvent,
)


class TestRbacEvents:
    def test_role_permissions_changed(self):
        e = RolePermissionsChangedEvent(role_code="admin")
        assert e.event_name == "role.permissions_changed"
        assert e.role_code == "admin"

    def test_role_deleted(self):
        e = RoleDeletedEvent(role_code="editor")
        assert e.event_name == "role.deleted"
        assert e.role_code == "editor"


class TestDepartmentEvents:
    def test_department_deleted(self):
        e = DepartmentDeletedEvent(department_id="abc-123")
        assert e.event_name == "department.deleted"
        assert e.department_id == "abc-123"


class TestUserEvents:
    def test_user_created(self):
        e = UserCreatedEvent(user_id="xyz-456")
        assert e.event_name == "user.created"
        assert e.user_id == "xyz-456"

    def test_user_deleted(self):
        e = UserDeletedEvent(user_id="xyz-456")
        assert e.event_name == "user.deleted"
        assert e.user_id == "xyz-456"

    def test_user_roles_changed(self):
        e = UserRolesChangedEvent(user_id="xyz-456", role_codes=["admin", "editor"])
        assert e.event_name == "user.roles_changed"
        assert e.role_codes == ["admin", "editor"]

    def test_user_password_changed(self):
        e = UserPasswordChangedEvent(user_id="xyz-456")
        assert e.event_name == "user.password_changed"
        assert e.user_id == "xyz-456"


class TestAuthEvents:
    def test_user_login(self):
        e = UserLoginEvent(user_id="xyz-456")
        assert e.event_name == "user.login"
        assert e.user_id == "xyz-456"

    def test_user_logout(self):
        e = UserLogoutEvent(user_id="xyz-456")
        assert e.event_name == "user.logout"
        assert e.user_id == "xyz-456"


class TestScriptEvents:
    def test_script_executed(self):
        e = ScriptExecutedEvent(script_id="s-1", executor_id="u-1")
        assert e.event_name == "script.executed"
        assert e.script_id == "s-1"
        assert e.executor_id == "u-1"


class TestScheduleEvents:
    def test_schedule_created(self):
        e = ScheduleCreatedEvent(schedule_id="sch-1", task_name="my_task")
        assert e.event_name == "schedule.created"
        assert e.task_name == "my_task"

    def test_schedule_deleted(self):
        e = ScheduleDeletedEvent(schedule_id="sch-1", task_name="my_task")
        assert e.event_name == "schedule.deleted"

    def test_schedule_toggled(self):
        e = ScheduleToggledEvent(schedule_id="sch-1", enabled=True)
        assert e.event_name == "schedule.toggled"
        assert e.enabled is True


class TestMenuEvents:
    def test_menu_changed(self):
        e = MenuChangedEvent(menu_id="m-1", action="created")
        assert e.event_name == "menu.changed"
        assert e.action == "created"
