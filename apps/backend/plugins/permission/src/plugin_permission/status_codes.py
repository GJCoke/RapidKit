"""
RBAC plugin status codes (plugin_id=03).

6-digit format: 03TNNN
- T=4: permission/security errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class RbacStatusCode(BaseStatusCode):
    """RBAC plugin error codes."""

    # Permission/security errors (034xxx)
    ROLE_PERMISSION_DENIED = (34001, "permission.error.rolePermissionDenied")
    RESOURCE_PERMISSION_DENIED = (34002, "permission.error.resourcePermissionDenied")
    DATA_WRITE_DENIED = (34003, "permission.error.dataWriteDenied")
    FIELD_WRITE_DENIED = (34004, "permission.error.fieldWriteDenied")
    CREATE_PERMISSION_DENIED = (34005, "permission.error.createPermissionDenied")

    # Resource not found (035xxx)
    ROLE_NOT_FOUND = (35001, "permission.error.roleNotFound")
    ROLE_OPERATION_ERROR = (35002, "permission.error.roleOperationError")
    PERMISSION_OPERATION_ERROR = (35003, "permission.error.permissionOperationError")
