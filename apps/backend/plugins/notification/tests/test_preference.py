"""
真实 PreferenceResolver 行为测试。

Author : Coke
Date   : 2026-09-04
"""

from uuid import uuid4

import pytest
from plugin_notification.categories import CategoryDef, CategoryRegistry
from plugin_notification.crud import PreferenceCRUD
from plugin_notification.preference.services import PreferenceResolver


def _registry() -> CategoryRegistry:
    registry = CategoryRegistry()
    registry.register(CategoryDef(code="user.invited", name_key="k", closable=True))
    registry.register(
        CategoryDef(
            code="admin.announcement",
            name_key="k2",
            closable=False,
            reserved=True,
        )
    )
    return registry


@pytest.mark.asyncio
async def test_unconfigured_defaults_to_receive(db_session):
    first_user_id, second_user_id = uuid4(), uuid4()
    resolver = PreferenceResolver(session=db_session, registry=_registry())

    allowed = await resolver.filter_allowed(
        [first_user_id, second_user_id],
        category="user.invited",
        mandatory=False,
    )

    assert set(allowed) == {first_user_id, second_user_id}


@pytest.mark.asyncio
async def test_explicit_disabled_is_filtered(db_session):
    disabled_user_id, enabled_user_id = uuid4(), uuid4()
    await PreferenceCRUD(db_session).create(
        {
            "user_id": disabled_user_id,
            "category": "user.invited",
            "enabled": False,
        }
    )
    await db_session.commit()
    resolver = PreferenceResolver(session=db_session, registry=_registry())

    allowed = await resolver.filter_allowed(
        [disabled_user_id, enabled_user_id],
        category="user.invited",
        mandatory=False,
    )

    assert allowed == [enabled_user_id]


@pytest.mark.asyncio
async def test_mandatory_bypasses_preference(db_session):
    user_id = uuid4()
    await PreferenceCRUD(db_session).create(
        {
            "user_id": user_id,
            "category": "user.invited",
            "enabled": False,
        }
    )
    await db_session.commit()
    resolver = PreferenceResolver(session=db_session, registry=_registry())

    allowed = await resolver.filter_allowed(
        [user_id],
        category="user.invited",
        mandatory=True,
    )

    assert allowed == [user_id]


@pytest.mark.asyncio
async def test_non_closable_category_bypasses_preference(db_session):
    user_id = uuid4()
    await PreferenceCRUD(db_session).create(
        {
            "user_id": user_id,
            "category": "admin.announcement",
            "enabled": False,
        }
    )
    await db_session.commit()
    resolver = PreferenceResolver(session=db_session, registry=_registry())

    allowed = await resolver.filter_allowed(
        [user_id],
        category="admin.announcement",
        mandatory=False,
    )

    assert allowed == [user_id]
