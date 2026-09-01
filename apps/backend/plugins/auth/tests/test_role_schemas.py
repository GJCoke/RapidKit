from plugin_permission.role.schemas import RoleUpdate


def test_role_update_ignores_permission_fields() -> None:
    update = RoleUpdate.model_validate(
        {
            "name": "Guest",
            "description": "Guest role",
            "code": "GUEST",
            "status": "1",
            "routerPermissions": [],
            "buttonPermissions": [],
            "interfacePermissions": [],
        }
    )

    assert "router_permissions" not in update.model_fields_set
    assert "button_permissions" not in update.model_fields_set
    assert "interface_permissions" not in update.model_fields_set
