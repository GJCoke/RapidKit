"""
Security utilities for authentication and authorization.

This module provides functionality for:

- JWT (JSON Web Token): Create and decode secure tokens for user authentication.
- Password Hashing: Securely hash and verify passwords using bcrypt.
- RSA Encryption: Support for RSA key-based signing and verification for JWT or other sensitive data.

Author : Coke
Date   : 2025-04-17
"""

import base64
import logging
from datetime import UTC, datetime, timedelta
from typing import overload
from uuid import UUID

import bcrypt
from authlib.jose import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey, generate_private_key
from cryptography.hazmat.primitives.asymmetric.types import PrivateKeyTypes, PublicKeyTypes
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key
from pydantic import BaseModel, SecretStr

logger = logging.getLogger(__name__)


class AccessJWT(BaseModel):
    """JWT 访问令牌中包含的用户信息。"""

    sub: UUID
    name: str
    jti: UUID


class RefreshJWT(AccessJWT):
    """JWT 刷新令牌中包含的用户信息。"""

    agent: str


class AccessSecret(SecretStr):
    """访问令牌专用密钥类型。"""

    def __str__(self) -> str:
        return "AccessSecret(**********)"


class RefreshSecret(SecretStr):
    """刷新令牌专用密钥类型。"""

    def __str__(self) -> str:
        return "RefreshSecret(**********)"


def create_token(
    user: AccessJWT,
    expires_delta: timedelta,
    key: AccessSecret | RefreshSecret,
    alg: str,
) -> str:
    """
    创建 JWT 访问令牌。

    Args:
        user: 要编码到令牌中的用户信息。
        expires_delta: 令牌过期时长。
        key: 用于签名 JWT 的密钥。
        alg: 签名算法。

    Returns:
        生成的 JWT 字符串。
    """
    header = dict(alg=alg, typ="JWT")
    payload = user.model_dump(mode="json")
    payload["exp"] = datetime.now(UTC) + expires_delta

    return jwt.encode(header=header, payload=payload, key=key.get_secret_value()).decode("utf-8")


@overload
def decode_token(token: str, key: AccessSecret) -> AccessJWT: ...


@overload
def decode_token(token: str, key: RefreshSecret) -> RefreshJWT: ...


def decode_token(token: str, key: AccessSecret | RefreshSecret) -> AccessJWT | RefreshJWT:
    """
    解码并校验 JWT 令牌，返回对应的用户信息。

    Args:
        token: 待解码的 JWT 字符串。
        key: 用于校验签名的密钥。

    Returns:
        解码后的用户信息。

    Raises:
        JoseError: 令牌无效或解码失败时抛出。
    """
    payload = jwt.decode(token, key=key.get_secret_value())
    payload.validate()

    return AccessJWT(**payload) if isinstance(key, AccessSecret) else RefreshJWT(**payload)


def hash_password(password: str) -> bytes:
    """
    使用 bcrypt 对明文密码进行哈希。

    Args:
        password: 明文密码。

    Returns:
        加盐哈希后的密码。
    """
    bytes_password = bytes(password, "utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(bytes_password, salt)


def check_password(password: str, hashed_password: bytes) -> bool:
    """
    校验明文密码与哈希密码是否匹配。

    Args:
        password: 明文密码。
        hashed_password: 已哈希的密码。

    Returns:
        匹配返回 True，否则返回 False。
    """
    bytes_password = bytes(password, "utf-8")
    return bcrypt.checkpw(bytes_password, hashed_password)


def generate_rsa_key_pair() -> tuple[RSAPrivateKey, RSAPublicKey]:
    """
    生成一对 RSA 私钥和公钥。

    Returns:
        (私钥, 公钥) 元组。
    """
    private_key = generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    return private_key, public_key


def serialize_key(key: RSAPrivateKey | RSAPublicKey) -> bytes:
    """
    将 RSA 密钥（私钥或公钥）序列化为 PEM 格式。

    Args:
        key: 待序列化的 RSA 密钥。

    Returns:
        PEM 编码的字节串。
    """
    if isinstance(key, RSAPrivateKey):
        return key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )

    return key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def load_public_pem(pem: str) -> PublicKeyTypes:
    """
    从 PEM 字符串加载公钥。

    Args:
        pem: PEM 格式的公钥字符串。

    Returns:
        加载后的公钥对象。
    """
    return load_pem_public_key(pem.encode("utf-8"))


def load_private_key(pem: str, password: bytes | None = None) -> PrivateKeyTypes:
    """
    从 PEM 字符串加载 RSA 私钥。

    Args:
        pem: PEM 编码的私钥字符串。
        password: 若 PEM 加密则需提供密码。

    Returns:
        加载后的 RSA 私钥对象。
    """
    return load_pem_private_key(pem.encode("utf-8"), password=password)


def encrypt_message(public_key: RSAPublicKey, message: str) -> str:
    """
    使用 RSA 公钥加密消息。

    Args:
        public_key: 用于加密的 RSA 公钥。
        message: 明文消息。

    Returns:
        base64 编码的加密消息。
    """
    encrypted_message = public_key.encrypt(
        message.encode("utf-8"),
        padding.PKCS1v15(),
    )

    return base64.b64encode(encrypted_message).decode("utf-8")


def decrypt_message(private_key: RSAPrivateKey, encrypted_message: str) -> str:
    """
    使用 RSA 私钥解密消息。

    Args:
        private_key: 用于解密的 RSA 私钥。
        encrypted_message: base64 编码的加密消息。

    Returns:
        解密后的明文消息。
    """
    decrypted_message = private_key.decrypt(
        base64.b64decode(encrypted_message),
        padding.PKCS1v15(),
    )
    return decrypted_message.decode("utf-8")


if __name__ == "__main__":
    __private_key, __public_key = generate_rsa_key_pair()
    _private_key, _public_key = serialize_key(__private_key), serialize_key(__public_key)
    with open("private.pem", "wb") as private_key_file:
        private_key_file.write(_private_key)

    with open("public.pem", "wb") as public_key_file:
        public_key_file.write(_public_key)
