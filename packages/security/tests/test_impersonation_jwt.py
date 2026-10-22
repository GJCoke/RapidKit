from uuid import uuid4

import pytest
from authlib.jose import jwt
from authlib.jose.errors import JoseError
from pydantic import ValidationError
from rapidkit_security import (
    AccessSecret,
    ImpersonationJWT,
    ImpersonationSecret,
    create_impersonation_token,
    decode_impersonation_token,
    decode_token,
)

KEY = ImpersonationSecret("simulation-key")


def claims(**updates):
    return (
        dict(
            token_type="impersonation",
            sub=str(uuid4()),
            act=str(uuid4()),
            sid=str(uuid4()),
            jti=str(uuid4()),
            exp=4102444800,
        )
        | updates
    )


def signed(payload, alg="HS256", key="simulation-key"):
    return jwt.encode({"alg": alg}, payload, key).decode()


def test_roundtrip_fixed_exp_and_access_isolation():
    value = ImpersonationJWT(**claims(iat=1700000000.125))
    token = create_impersonation_token(value, KEY, "HS256")
    assert decode_impersonation_token(token, KEY, "HS256") == value
    with pytest.raises(JoseError):
        decode_token(token, AccessSecret("access-key"))
    assert str(KEY) == "ImpersonationSecret(**********)"


def test_expired_requires_explicit_mode():
    token = signed(claims(exp=1))
    with pytest.raises(JoseError):
        decode_impersonation_token(token, KEY, "HS256")
    assert decode_impersonation_token(token, KEY, "HS256", allow_expired=True).exp == 1


@pytest.mark.parametrize("allow_expired", [False, True])
@pytest.mark.parametrize("field", ["token_type", "sub", "act", "sid", "jti", "exp"])
def test_missing_claims_rejected(field, allow_expired):
    payload = claims()
    del payload[field]
    with pytest.raises((JoseError, ValidationError)):
        decode_impersonation_token(signed(payload), KEY, "HS256", allow_expired=allow_expired)


@pytest.mark.parametrize("allow_expired", [False, True])
@pytest.mark.parametrize("updates", [{"token_type": "access"}, {"act": "bad"}, {"extra": True}])
def test_invalid_claims_rejected(updates, allow_expired):
    with pytest.raises((JoseError, ValidationError)):
        decode_impersonation_token(signed(claims(**updates)), KEY, "HS256", allow_expired=allow_expired)


@pytest.mark.parametrize("allow_expired", [False, True])
@pytest.mark.parametrize("alg,key", [("HS384", "simulation-key"), ("HS256", "wrong-key")])
def test_algorithm_and_signature_rejected(alg, key, allow_expired):
    with pytest.raises(JoseError):
        decode_impersonation_token(signed(claims(), alg, key), KEY, "HS256", allow_expired=allow_expired)


def test_stop_mode_still_validates_future_not_before():
    with pytest.raises(JoseError):
        decode_impersonation_token(signed(claims(nbf=4102444800)), KEY, "HS256", allow_expired=True)


@pytest.mark.parametrize("allow_expired", [False, True])
def test_algorithm_parameter_cannot_unlock_non_hs256(allow_expired):
    with pytest.raises(JoseError):
        decode_impersonation_token(signed(claims(), "HS512"), KEY, "HS512", allow_expired=allow_expired)


@pytest.mark.parametrize("claim", ["iat", "exp"])
@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "123"])
def test_stop_mode_validates_numeric_dates(claim, value):
    with pytest.raises((JoseError, ValidationError)):
        decode_impersonation_token(signed(claims(**{claim: value})), KEY, "HS256", allow_expired=True)
