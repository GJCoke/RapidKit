"""Administrator contact response contract tests."""

from uuid import uuid4

from plugin_user.schemas import AdminContactResponse


def test_admin_contact_serializes_only_public_contact_fields() -> None:
    contact = AdminContactResponse(
        id=uuid4(),
        name="Admin",
        avatar=None,
        email="admin@example.com",
    )

    assert set(contact.model_dump(by_alias=True)) == {"id", "name", "avatar", "email"}
