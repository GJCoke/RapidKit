from rapidkit_security.rsa import (
    decrypt_message,
    encrypt_message,
    generate_rsa_key_pair,
    load_private_key,
    load_public_pem,
    serialize_key,
)


class TestRSA:
    def test_generate_and_serialize(self):
        private, public = generate_rsa_key_pair()
        priv_pem = serialize_key(private)
        pub_pem = serialize_key(public)
        assert b"PRIVATE KEY" in priv_pem
        assert b"PUBLIC KEY" in pub_pem

    def test_encrypt_decrypt_roundtrip(self):
        private, public = generate_rsa_key_pair()
        msg = "hello world"
        encrypted = encrypt_message(public, msg)
        decrypted = decrypt_message(private, encrypted)
        assert decrypted == msg

    def test_load_keys_from_pem(self):
        private, public = generate_rsa_key_pair()
        priv_pem = serialize_key(private).decode()
        pub_pem = serialize_key(public).decode()
        loaded_priv = load_private_key(priv_pem)
        loaded_pub = load_public_pem(pub_pem)
        assert loaded_priv is not None
        assert loaded_pub is not None
