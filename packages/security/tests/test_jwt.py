from datetime import timedelta
import base64
import json
import time
from uuid import uuid4

import pytest
from authlib.jose import jwt
from authlib.jose.errors import JoseError
from pydantic import ValidationError
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


@pytest.mark.parametrize("refresh, seconds", [(False, 900), (True, 604800)])
def test_new_tokens_carry_subsecond_iat_and_exp(monkeypatch, refresh, seconds):
    monkeypatch.setattr(time, "time", lambda: 1760000000.125)
    key = RefreshSecret("refresh") if refresh else AccessSecret("access")
    values = dict(sub=uuid4(), name="test", jti=uuid4())
    user = RefreshJWT(**values, agent="test") if refresh else AccessJWT(**values)
    decoded = decode_token(create_token(user, timedelta(seconds=seconds), key, "HS256"), key)
    assert decoded.iat == 1760000000.125
    assert decoded.exp == 1760000000.125 + seconds


def signed_claims(payload, key, alg="HS256"):
    if alg == "none":
        encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()
        return f"{encode({'alg': 'none'})}.{encode(payload)}."
    return jwt.encode({"alg": alg}, payload, key.get_secret_value()).decode()


def test_legacy_without_iat_decodes():
    key = AccessSecret("access")
    payload = dict(sub=str(uuid4()), name="test", jti=str(uuid4()), exp=4102444800)
    decoded = decode_token(signed_claims(payload, key), key)
    assert decoded.iat is None
    assert decoded.exp == 4102444800


@pytest.mark.parametrize("alg", ["HS384", "HS512", "none"])
@pytest.mark.parametrize("key", [AccessSecret("access"), RefreshSecret("refresh")])
def test_non_hs256_rejected(alg, key):
    payload = dict(sub=str(uuid4()), name="test", jti=str(uuid4()), exp=4102444800, agent="test")
    with pytest.raises(JoseError):
        decode_token(signed_claims(payload, key, alg), key)


@pytest.mark.parametrize("claim", ["iat", "exp"])
@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "123"])
def test_invalid_numeric_date_rejected(claim, value):
    key = AccessSecret("access")
    payload = dict(sub=str(uuid4()), name="test", jti=str(uuid4()), exp=4102444800)
    payload[claim] = value
    with pytest.raises((JoseError, ValidationError)):
        decode_token(signed_claims(payload, key), key)


def test_exp_is_required_and_signing_algorithm_is_pinned():
    key = AccessSecret("access")
    user = AccessJWT(sub=uuid4(), name="test", jti=uuid4())
    with pytest.raises(JoseError):
        decode_token(signed_claims(user.model_dump(mode="json"), key), key)
    with pytest.raises(JoseError):
        create_token(user, timedelta(seconds=900), key, "HS512")
