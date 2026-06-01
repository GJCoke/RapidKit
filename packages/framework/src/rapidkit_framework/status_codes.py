"""
Application status code definitions.

6-digit format: [plugin(2)][type(1)][sequence(3)]
- Plugin 00 = framework universal codes
- Type 0-8 = error category (see StatusCodeType)
- Sequence 001-999 = per-plugin+type counter

Author : Coke
Date   : 2025-12-25
"""

from enum import Enum


class StatusCodeType(Enum):
    """Error type categories."""

    SUCCESS = 0
    PARAMETER_ERROR = 1
    BUSINESS_ERROR = 2
    STATE_CONFLICT = 3
    PERMISSION_ERROR = 4
    RESOURCE_NOT_FOUND = 5
    THIRD_PARTY_ERROR = 6
    SYSTEM_ERROR = 7
    SOCKET_ERROR = 8


class BaseStatusCode(Enum):
    """Base class for all status code enums (framework and plugin)."""

    def __init__(self, code: int, description: str) -> None:
        self.code = code
        self.description = description

    def __int__(self) -> int:
        return self.code

    def __str__(self) -> str:
        return self.description

    @property
    def plugin_id(self) -> int:
        """Plugin segment (first 2 digits)."""
        return self.code // 10000

    @property
    def type(self) -> int:
        """Error type segment (3rd digit)."""
        return (self.code % 10000) // 1000

    @property
    def sequence(self) -> int:
        """Sequence segment (last 3 digits)."""
        return self.code % 1000


class StatusCode(BaseStatusCode):
    """Framework universal codes (plugin_id=00)."""

    # ==================== Success (000xxx) ====================
    SUCCESS = (0, "common.error.success")

    # ==================== Parameter errors (001xxx) ====================
    VALIDATION_ERROR = (1001, "common.error.validationError")
    INVALID_INPUT = (1002, "common.error.invalidInput")
    MISSING_REQUIRED_FIELD = (1003, "common.error.missingRequiredField")
    INVALID_FORMAT = (1004, "common.error.invalidFormat")
    BAD_REQUEST = (1005, "common.error.badRequest")
    TOO_MANY_REQUESTS = (1006, "common.error.tooManyRequests")

    # ==================== Business errors (002xxx) ====================
    INVALID_OPERATION = (2001, "common.error.invalidOperation")

    # ==================== State conflicts (003xxx) ====================
    ALREADY_EXISTS = (3001, "common.error.alreadyExists")
    DUPLICATE_REQUEST = (3002, "common.error.duplicateRequest")
    STATE_CONFLICT = (3003, "common.error.stateConflict")
    CONCURRENT_MODIFICATION = (3004, "common.error.concurrentModification")

    # ==================== Permission errors (004xxx) ====================
    FORBIDDEN = (4001, "common.error.forbidden")

    # ==================== Resource not found (005xxx) ====================
    RESOURCE_NOT_FOUND = (5001, "common.error.resourceNotFound")

    # ==================== Third-party (006xxx) ====================
    EXTERNAL_SERVICE_ERROR = (6001, "common.error.externalServiceError")
    THIRD_PARTY_ERROR = (6002, "common.error.thirdPartyError")
    DEPENDENCY_ERROR = (6003, "common.error.dependencyError")

    # ==================== System (007xxx) ====================
    INTERNAL_SERVER_ERROR = (7001, "common.error.internalServerError")
    DATABASE_ERROR = (7002, "common.error.databaseError")
    SYSTEM_BUSY = (7003, "common.error.systemBusy")

    # ==================== Socket (008xxx) ====================
    SOCKET_CONNECTION_ERROR = (8001, "common.error.socketConnectionError")
    SOCKET_CONNECTION_CLOSED = (8002, "common.error.socketConnectionClosed")
    SOCKET_MESSAGE_SEND_ERROR = (8003, "common.error.socketMessageSendError")
    SOCKET_INVALID_MESSAGE = (8004, "common.error.socketInvalidMessage")
    SOCKET_AUTHENTICATION_FAILED = (8005, "common.error.socketAuthenticationFailed")
    SOCKET_NAMESPACE_NOT_FOUND = (8006, "common.error.socketNamespaceNotFound")


def get_status_code(code: int) -> BaseStatusCode | None:
    """Look up a status code by integer value (searches StatusCode only)."""
    for status in StatusCode:
        if status.code == code:
            return status
    return None


def get_status_description(code: int) -> str:
    """Get description for a code, falling back to string of the int."""
    status = get_status_code(code)
    return status.description if status else str(code)
