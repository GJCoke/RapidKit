"""Authentication domain protocols."""

from typing import TYPE_CHECKING, Protocol
from uuid import UUID

from rapidkit_common.protocols.user import UserProtocol

if TYPE_CHECKING:
    from rapidkit_core.redis_client import AsyncRedisClient


class TokenDecoder(Protocol):
    """Decode a JWT token to extract user identity. Provided by plugin_auth."""

    async def decode_user_id(self, token: str) -> UUID | None: ...


class Authenticator(Protocol):
    """Authenticate via credentials. Provided by plugin_auth."""

    async def authenticate(self, username: str, password: str) -> str:
        """Return access_token on success, raise AppException on failure."""
        ...


class CurrentUserProvider(Protocol):
    """Resolve a full user object from a token. Provided by plugin_auth."""

    async def get_current_user(self, token: str) -> UserProtocol | None: ...


class PasswordDecryptor(Protocol):
    """Decrypt RSA-encrypted password. Provided by plugin_auth."""

    def decrypt(self, encrypted_password: str) -> str:
        """Decrypt and return plaintext password. Raises on failure."""
        ...

    def decrypt_and_hash(self, encrypted_password: str) -> bytes:
        """Decrypt and return bcrypt hash. Raises on failure."""
        ...


class SessionInvalidator(Protocol):
    """Invalidate user sessions and caches. Provided by plugin_auth.

    Used by other plugins (e.g., user) to force re-login or clear caches
    without directly manipulating auth's Redis key namespace.
    """

    async def invalidate_user_sessions(self, user_id: UUID, redis: "AsyncRedisClient") -> None:
        """Clear all refresh tokens and mark user for forced re-login."""
        ...

    async def invalidate_permission_cache(self, user_id: UUID, redis: "AsyncRedisClient") -> None:
        """Clear the user's permission cache."""
        ...

    async def invalidate_user_cache(self, user_id: UUID, redis: "AsyncRedisClient") -> None:
        """Clear the user's info cache."""
        ...
