"""Administrator contact endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_contacts_exposes_only_minimal_fields(
    client: AsyncClient,
    init,
    auth_headers: dict,
) -> None:
    response = await client.get("/users/admin-contacts", headers=auth_headers)

    assert response.status_code == 200
    contacts = response.json()["data"]
    assert contacts
    assert set(contacts[0]) == {"id", "name", "avatar", "email"}
    assert all(contact["email"] for contact in contacts)


@pytest.mark.asyncio
async def test_admin_contacts_requires_authentication(client: AsyncClient, init) -> None:
    response = await client.get("/users/admin-contacts")

    assert response.status_code == 401
