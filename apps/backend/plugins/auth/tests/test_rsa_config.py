"""The production env example accepts PEM strings and mounted key files."""

import pytest
from plugin_auth.auth_config import AuthConfig
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from rapidkit_security import generate_rsa_key_pair, serialize_key


@pytest.mark.parametrize("encoding", ["pem", "escaped", "file"])
def test_production_keys_accept_pem_or_files(monkeypatch, tmp_path, encoding):
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    private, public = generate_rsa_key_pair()
    private_text = serialize_key(private).decode()
    public_text = serialize_key(public).decode()
    if encoding == "file":
        private_path = tmp_path / "private.pem"
        public_path = tmp_path / "public.pem"
        private_path.write_text(private_text)
        public_path.write_text(public_text)
        private_value, public_value = str(private_path), str(public_path)
    elif encoding == "escaped":
        private_value = private_text.replace("\n", "\\n")
        public_value = public_text.replace("\n", "\\n")
    else:
        private_value, public_value = private_text, public_text
    config = AuthConfig(
        _env_file=None,
        ACCESS_TOKEN_KEY="production-access-test",
        REFRESH_TOKEN_KEY="production-refresh-test",
        IMPERSONATION_TOKEN_KEY="production-impersonation-test",
        RSA_PRIVATE_KEY=private_value,
        RSA_PUBLIC_KEY=public_value,
    )
    assert config.RSA_PRIVATE_KEY.public_key().public_numbers() == public.public_numbers()
    assert config.RSA_PUBLIC_KEY.get_secret_value() == public_text
