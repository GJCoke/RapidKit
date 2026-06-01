"""
Auth plugin status codes (plugin_id=01).

6-digit format: 01TNNN
- T=2: business errors
- T=4: permission/security errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class AuthStatusCode(BaseStatusCode):
    """Auth plugin error codes."""

    # Business errors (012xxx)
    DEPARTMENT_HAS_CHILDREN = (12001, "auth.error.departmentHasChildren")
    USER_OPERATION_ERROR = (12002, "auth.error.userOperationError")
    ROLE_OPERATION_ERROR = (12003, "auth.error.roleOperationError")
    PERMISSION_OPERATION_ERROR = (12004, "auth.error.permissionOperationError")
    INVALID_OPERATION = (12005, "auth.error.invalidOperation")

    # Permission/security errors (014xxx)
    AUTHENTICATION_FAILED = (14001, "auth.error.authenticationFailed")
    TOKEN_EXPIRED = (14002, "auth.error.tokenExpired")
    TOKEN_INVALID = (14003, "auth.error.tokenInvalid")
    INSUFFICIENT_PERMISSIONS = (14004, "auth.error.insufficientPermissions")
    ROLE_PERMISSION_DENIED = (14005, "auth.error.rolePermissionDenied")
    MENU_PERMISSION_DENIED = (14006, "auth.error.menuPermissionDenied")
    RESOURCE_PERMISSION_DENIED = (14007, "auth.error.resourcePermissionDenied")
    USER_DISABLED = (14008, "auth.error.userDisabled")
    TOKEN_REFRESH_FAILED = (14009, "auth.error.tokenRefreshFailed")
    ACCOUNT_LOCKED = (14010, "auth.error.accountLocked")

    # Resource not found (015xxx)
    USER_NOT_FOUND = (15001, "auth.error.userNotFound")
    ROLE_NOT_FOUND = (15002, "auth.error.roleNotFound")
    MENU_NOT_FOUND = (15003, "auth.error.menuNotFound")
    MENU_INVALID_PARENT = (15004, "auth.error.menuInvalidParent")
