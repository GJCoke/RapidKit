"""Cross-plugin protocol definitions — the shared contracts between plugins."""

from rapidkit_common.protocols.auth import (
    AuthContext,
    AuthContextResolver,
    Authenticator,
    CurrentUserProvider,
    PasswordDecryptor,
    SessionInvalidator,
    TokenDecoder,
)
from rapidkit_common.protocols.department import DepartmentResolver
from rapidkit_common.protocols.impersonation import (
    ImpersonationAuditWriter,
    ImpersonationRevoker,
    ImpersonationSocketCloser,
)
from rapidkit_common.protocols.operations import (
    ApiErrorComparison,
    DayComparison,
    MonitoringOperationsProvider,
    OperationsTrendPoint,
    QueueSnapshot,
    ServerSnapshot,
    SyncSnapshot,
    TaskSuccessComparison,
    UserOperationsProvider,
    WorkerOperationsProvider,
)
from rapidkit_common.protocols.permission import PermissionChecker, PolicyLoader
from rapidkit_common.protocols.user import UserProtocol, UserQueryService, UserResolver

__all__ = [
    "AuthContext",
    "AuthContextResolver",
    "Authenticator",
    "ImpersonationAuditWriter",
    "ImpersonationRevoker",
    "ImpersonationSocketCloser",
    "CurrentUserProvider",
    "DepartmentResolver",
    "ApiErrorComparison",
    "DayComparison",
    "MonitoringOperationsProvider",
    "OperationsTrendPoint",
    "PasswordDecryptor",
    "PermissionChecker",
    "PolicyLoader",
    "QueueSnapshot",
    "ServerSnapshot",
    "SessionInvalidator",
    "TokenDecoder",
    "SyncSnapshot",
    "TaskSuccessComparison",
    "UserOperationsProvider",
    "UserProtocol",
    "UserQueryService",
    "UserResolver",
    "WorkerOperationsProvider",
]
