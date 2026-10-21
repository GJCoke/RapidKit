from plugin_permission.role.schemas import RoleUpdate


def test_role_update_ignores_permission_fields() -> None:
    update = RoleUpdate.model_validate(
        {
            "name": "Guest",
            "description": "Guest role",
            "code": "GUEST",
            "status": "1",
            "permissionCodes": ["user:read"],
        }
    )

    assert "permission_codes" not in update.model_fields_set
