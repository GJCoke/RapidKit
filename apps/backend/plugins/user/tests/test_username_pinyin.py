"""Tests for canonical username suggestions derived from names."""

from plugin_user.username_pinyin import check_username_pinyin, suggest_username


def test_suggest_username_normalizes_chinese_english_and_separators():
    assert suggest_username(" 张-Alice·三 ") == "zhangalicesan"


def test_suggest_username_uses_library_default_for_polyphonic_name():
    assert suggest_username("曾乐") == "cengle"


def test_check_username_pinyin_requires_exact_match():
    assert check_username_pinyin("张三", "zhangsan").consistent is True
    assert check_username_pinyin("张三", "ZhangSan").consistent is False
    assert check_username_pinyin("张三", "zhang_san").consistent is False
    assert check_username_pinyin("张三", "zhangsan1").consistent is False
