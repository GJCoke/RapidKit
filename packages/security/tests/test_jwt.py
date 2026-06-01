from datetime import timedelta
from uuid import uuid4

from rapidkit_security.jwt import AccessJWT, RefreshJWT, create_token, decode_token
from rapidkit_security.types import AccessSecret, RefreshSecret


class TestJWT:
    def test_create_and_decode_access_token(self):
        key = AccessSecret("test-secret-key-for-access")
        user = AccessJWT(sub=uuid4(), name="test", jti=uuid4())
        token = create_token(user, timedelta(hours=1), key, "HS256")
        decoded = decode_token(token, key)
        assert decoded.sub == user.sub
        assert decoded.name == user.name

    def test_create_and_decode_refresh_token(self):
        key = RefreshSecret("test-secret-key-for-refresh")
        user = RefreshJWT(sub=uuid4(), name="test", jti=uuid4(), agent="chrome")
        token = create_token(user, timedelta(hours=1), key, "HS256")
        decoded = decode_token(token, key)
        assert decoded.sub == user.sub
        assert decoded.agent == "chrome"
