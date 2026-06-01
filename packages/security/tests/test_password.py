from rapidkit_security.password import check_password, hash_password


class TestPassword:
    def test_hash_and_check_valid(self):
        hashed = hash_password("my_password")
        assert check_password("my_password", hashed)

    def test_check_invalid(self):
        hashed = hash_password("my_password")
        assert not check_password("wrong_password", hashed)
