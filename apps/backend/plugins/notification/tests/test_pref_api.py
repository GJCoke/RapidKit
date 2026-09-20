"""
用户偏好 API 端点函数级测试。

Author : Coke
Date   : 2026-09-04
"""

from typing import Any
from uuid import uuid4

import plugin_notification.pref_api as pref_api_module
import pytest
from plugin_notification.categories import CategoryDef, CategoryRegistry
from plugin_notification.crud import PreferenceCRUD
from plugin_notification.pref_api import list_preferences, update_preference
from plugin_notification.pref_schemas import PreferenceUpdateRequest
from plugin_notification.status_codes import NotificationStatusCode
from pydantic import ValidationError
from rapidkit_framework.exceptions import AppException


class _User:
    def __init__(self) -> None:
        self.id = uuid4()
        self.is_admin = False
        self.roles: list[str] = []
        self.department_id = None


@pytest.mark.asyncio
async def test_list_preferences_includes_builtin(db_session):
    user = _User()

    response = await list_preferences(user=user, crud=PreferenceCRUD(db_session))

    assert response.data is not None
    codes = {item.category for item in response.data}
    assert "user.invited" in codes
    assert "admin.announcement" in codes
    announcement = next(
        item for item in response.data if item.category == "admin.announcement"
    )
    assert announcement.closable is False
    assert announcement.enabled is True


@pytest.mark.asyncio
async def test_update_closable_category_persists_for_authenticated_user(db_session):
    user = _User()

    response = await update_preference(
        category="user.invited",
        body=PreferenceUpdateRequest(enabled=False),
        user=user,
        crud=PreferenceCRUD(db_session),
    )
    await db_session.commit()

    assert response.data is not None
    assert response.data.enabled is False
    row = await PreferenceCRUD(db_session).get_by_user_and_category(
        user.id,
        "user.invited",
    )
    assert row is not None
    assert row.user_id == user.id
    assert row.enabled is False


@pytest.mark.asyncio
async def test_update_reserved_category_rejected(db_session):
    user = _User()

    with pytest.raises(AppException) as exc_info:
        await update_preference(
            category="admin.announcement",
            body=PreferenceUpdateRequest(enabled=False),
            user=user,
            crud=PreferenceCRUD(db_session),
        )

    assert exc_info.value.code == NotificationStatusCode.CATEGORY_RESERVED.code


@pytest.mark.asyncio
async def test_update_toggle_twice_upserts(db_session):
    user = _User()
    crud = PreferenceCRUD(db_session)
    await update_preference(
        category="user.invited",
        body=PreferenceUpdateRequest(enabled=False),
        user=user,
        crud=crud,
    )
    await db_session.commit()

    await update_preference(
        category="user.invited",
        body=PreferenceUpdateRequest(enabled=True),
        user=user,
        crud=crud,
    )
    await db_session.commit()

    rows = await crud.list_by_user(user.id)
    matching = [row for row in rows if row.category == "user.invited"]
    assert len(matching) == 1
    assert matching[0].enabled is True


@pytest.mark.asyncio
async def test_update_unknown_category_uses_default_definition(db_session):
    user = _User()

    response = await update_preference(
        category="plugin.custom-event",
        body=PreferenceUpdateRequest(enabled=False),
        user=user,
        crud=PreferenceCRUD(db_session),
    )
    await db_session.commit()

    assert response.data is not None
    assert response.data.name_key == "notification.category.plugin.custom-event"
    assert response.data.closable is True
    assert response.data.reserved is False
    row = await PreferenceCRUD(db_session).get_by_user_and_category(
        user.id,
        "plugin.custom-event",
    )
    assert row is not None
    assert row.enabled is False


@pytest.mark.asyncio
async def test_update_non_reserved_non_closable_category_rejected(db_session, monkeypatch):
    registry = CategoryRegistry()
    registry.register(
        CategoryDef(
            code="system.required",
            name_key="notification.category.systemRequired",
            closable=False,
            reserved=False,
        )
    )
    monkeypatch.setattr(pref_api_module, "default_registry", lambda: registry)

    with pytest.raises(AppException) as exc_info:
        await update_preference(
            category="system.required",
            body=PreferenceUpdateRequest(enabled=False),
            user=_User(),
            crud=PreferenceCRUD(db_session),
        )

    assert exc_info.value.code == NotificationStatusCode.CATEGORY_NOT_CLOSABLE.code


@pytest.mark.parametrize("value", [0, 1, "0", "1", "true", "false"])
def test_update_request_rejects_weak_boolean_coercion(value: Any):
    with pytest.raises(ValidationError):
        PreferenceUpdateRequest.model_validate({"enabled": value})
