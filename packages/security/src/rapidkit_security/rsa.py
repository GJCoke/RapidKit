"""RSA key generation, serialization, encryption, and decryption."""

import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey, generate_private_key
from cryptography.hazmat.primitives.asymmetric.types import PrivateKeyTypes, PublicKeyTypes
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key


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
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
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
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return decrypted_message.decode("utf-8")
