from datetime import timedelta

import pytest
from plugin_auth.auth_config import AuthConfig
from pydantic import ValidationError
from rapidkit_core.config import ConfigError, settings
from rapidkit_core.environment import Environment
from rapidkit_security import generate_rsa_key_pair, serialize_key


@pytest.fixture
def config_values(monkeypatch):
    private, public = generate_rsa_key_pair()
    # Raw PEM contains slashes: bypass the existing path heuristic for unit tests.
    monkeypatch.setattr(AuthConfig, "load_rsa_key", classmethod(lambda cls, key: key))
    return dict(
        ACCESS_TOKEN_KEY="access",
        REFRESH_TOKEN_KEY="refresh",
        IMPERSONATION_TOKEN_KEY="impersonation",
        RSA_PRIVATE_KEY=serialize_key(private).decode(),
        RSA_PUBLIC_KEY=serialize_key(public).decode(),
    )


def test_default_duration(config_values):
    assert AuthConfig(_env_file=None, **config_values).IMPERSONATION_SESSION_EXP == timedelta(seconds=3600)


def test_seconds_duration(config_values):
    assert AuthConfig(
        _env_file=None, **config_values, IMPERSONATION_SESSION_EXP="123"
    ).IMPERSONATION_SESSION_EXP == timedelta(seconds=123)


@pytest.mark.parametrize("duration", ["0", "-1", timedelta(0), timedelta(seconds=-1)])
def test_nonpositive_duration_rejected(config_values, duration):
    with pytest.raises(ValidationError, match="must be positive"):
        AuthConfig(_env_file=None, **config_values, IMPERSONATION_SESSION_EXP=duration)


@pytest.mark.parametrize("key", ["access", "refresh"])
def test_reused_secret_rejected(config_values, key):
    config_values["IMPERSONATION_TOKEN_KEY"] = key
    with pytest.raises(ValidationError, match="must differ"):
        AuthConfig(_env_file=None, **config_values)


def test_deployed_missing_secret_rejected(config_values, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    del config_values["IMPERSONATION_TOKEN_KEY"]
    with pytest.raises(ConfigError, match="IMPERSONATION_TOKEN_KEY"):
        AuthConfig.ensure_keys_config(config_values)


def test_local_missing_secret_generated(config_values, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.TESTING)
    del config_values["IMPERSONATION_TOKEN_KEY"]
    assert AuthConfig.ensure_keys_config(config_values)["IMPERSONATION_TOKEN_KEY"]


def test_auth_expiry_defaults_and_override(config_values, monkeypatch):
    monkeypatch.delenv("ACCESS_TOKEN_EXP", raising=False)
    monkeypatch.delenv("REFRESH_TOKEN_EXP", raising=False)
    config = AuthConfig(_env_file=None, **config_values)
    assert config.ACCESS_TOKEN_EXP.total_seconds() == 900
    assert config.REFRESH_TOKEN_EXP.total_seconds() == 604800
    assert AuthConfig(_env_file=None, **config_values, ACCESS_TOKEN_EXP="123").ACCESS_TOKEN_EXP.total_seconds() == 123


def test_non_hs256_config_rejected(config_values):
    with pytest.raises(ValidationError, match="JWT_ALG"):
        AuthConfig(_env_file=None, **config_values, JWT_ALG="HS512")
