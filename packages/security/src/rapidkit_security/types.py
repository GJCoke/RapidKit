"""Secret key types for JWT tokens."""

from pydantic import SecretStr


class AccessSecret(SecretStr):
    """访问令牌专用密钥类型。"""

    def __str__(self) -> str:
        return "AccessSecret(**********)"


class RefreshSecret(SecretStr):
    """刷新令牌专用密钥类型。"""

    def __str__(self) -> str:
        return "RefreshSecret(**********)"
