"""
User plugin status codes (plugin_id=02).

6-digit format: 02TNNN
- T=1: parameter errors
- T=2: business errors
- T=4: permission errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class UserStatusCode(BaseStatusCode):
    """User plugin error codes."""

    # Parameter errors (021xxx)
    OLD_PASSWORD_REQUIRED = (21001, "user.error.oldPasswordRequired")
    OLD_PASSWORD_INCORRECT = (21002, "user.error.oldPasswordIncorrect")

    # Business errors (022xxx)
    CANNOT_DELETE_SELF = (22001, "user.error.cannotDeleteSelf")
    CANNOT_DELETE_ADMIN = (22002, "user.error.cannotDeleteAdmin")
    BATCH_CONTAINS_SELF = (22003, "user.error.batchContainsSelf")
    BATCH_CONTAINS_ADMIN = (22004, "user.error.batchContainsAdmin")

    # Permission errors (024xxx)
    PASSWORD_CHANGE_FORBIDDEN = (24001, "user.error.passwordChangeForbidden")
