"""Cross-plugin protocol definitions — the shared contracts between plugins."""

from rapidkit_common.protocols.auth import (
    Authenticator,
    CurrentUserProvider,
    PasswordDecryptor,
    SessionInvalidator,
    TokenDecoder,
)
from rapidkit_common.protocols.department import DepartmentResolver
from rapidkit_common.protocols.permission import PermissionChecker, PolicyLoader
from rapidkit_common.protocols.user import UserProtocol, UserQueryService, UserResolver

__all__ = [
    "Authenticator",
    "CurrentUserProvider",
    "DepartmentResolver",
    "PasswordDecryptor",
    "PermissionChecker",
    "PolicyLoader",
    "SessionInvalidator",
    "TokenDecoder",
    "UserProtocol",
    "UserQueryService",
    "UserResolver",
]
