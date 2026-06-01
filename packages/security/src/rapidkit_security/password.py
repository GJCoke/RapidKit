"""Password hashing and verification using bcrypt."""

import bcrypt


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
