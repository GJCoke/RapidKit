"""
RBAC plugin status codes (plugin_id=03).

6-digit format: 03TNNN
- T=4: permission/security errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class RbacStatusCode(BaseStatusCode):
    """RBAC plugin error codes."""

    # Business errors (032xxx)

    # State conflicts (033xxx)

    # Permission/security errors (034xxx)
    ROLE_PERMISSION_DENIED = (34001, "permission.error.rolePermissionDenied")
    RESOURCE_PERMISSION_DENIED = (34002, "permission.error.resourcePermissionDenied")
    UNKNOWN_PERMISSION_CODE = (34006, "permission.error.unknownPermissionCode")
    INVALID_DATA_SCOPE = (34007, "permission.error.invalidDataScope")

    # Resource not found (035xxx)
    ROLE_NOT_FOUND = (35001, "permission.error.roleNotFound")
    ROLE_OPERATION_ERROR = (35002, "permission.error.roleOperationError")
    PERMISSION_OPERATION_ERROR = (35003, "permission.error.permissionOperationError")

    # Permission packages (0351xx)
    PACKAGE_NOT_FOUND = (35101, "permission.error.packageNotFound")
    PACKAGE_INVALID_CODES = (35103, "permission.error.packageInvalidCodes")
    PACKAGE_INVALID_SCOPES = (35104, "permission.error.packageInvalidScopes")
