"""Unit tests for field masking functions."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

import pytest


class TestMaskPhone:
    def test_masks_chinese_phone(self):
        from plugin_permission.field_guard.maskers import mask_phone

        assert mask_phone("13812345678") == "138****5678"

    def test_short_string_fully_masked(self):
        from plugin_permission.field_guard.maskers import mask_phone

        assert mask_phone("123") == "***"

    def test_none_returns_none(self):
        from plugin_permission.field_guard.maskers import mask_phone

        assert mask_phone(None) is None


class TestMaskEmail:
    def test_masks_email(self):
        from plugin_permission.field_guard.maskers import mask_email

        assert mask_email("user@example.com") == "u***@example.com"

    def test_short_local_part(self):
        from plugin_permission.field_guard.maskers import mask_email

        assert mask_email("a@b.com") == "a***@b.com"

    def test_none_returns_none(self):
        from plugin_permission.field_guard.maskers import mask_email

        assert mask_email(None) is None


class TestMaskIdCard:
    def test_masks_18_digit_id(self):
        from plugin_permission.field_guard.maskers import mask_id_card

        assert mask_id_card("320123199001011234") == "3201**********1234"

    def test_none_returns_none(self):
        from plugin_permission.field_guard.maskers import mask_id_card

        assert mask_id_card(None) is None


class TestMaskDefault:
    def test_masks_generic_string(self):
        from plugin_permission.field_guard.maskers import mask_default

        assert mask_default("sensitive data") == "******"

    def test_none_returns_none(self):
        from plugin_permission.field_guard.maskers import mask_default

        assert mask_default(None) is None


class TestGetMasker:
    def test_phone_field_gets_phone_masker(self):
        from plugin_permission.field_guard.maskers import get_masker, mask_phone

        masker = get_masker("user_phone")
        assert masker is mask_phone

    def test_email_field_gets_email_masker(self):
        from plugin_permission.field_guard.maskers import get_masker, mask_email

        masker = get_masker("contact_email")
        assert masker is mask_email

    def test_unknown_field_gets_default_masker(self):
        from plugin_permission.field_guard.maskers import get_masker, mask_default

        masker = get_masker("secret_field")
        assert masker is mask_default
