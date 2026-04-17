"""PluginConfig 解析器测试 — 环境变量展开、缺省值、文件缺失。"""

from pathlib import Path
from textwrap import dedent

import pytest
from rapidkit_core.plugin_config import load_plugin_config


class TestLoadPluginConfig:
    def test_empty_config_enables_all(self, tmp_path: Path):
        """空 plugins.toml 不禁用任何插件。"""
        config_path = tmp_path / "plugins.toml"
        config_path.write_text("[plugins]\n")
        result = load_plugin_config(config_path)
        assert result == {}

    def test_missing_file_returns_empty(self, tmp_path: Path):
        """文件不存在时返回空 dict（零配置兼容）。"""
        config_path = tmp_path / "nonexistent.toml"
        result = load_plugin_config(config_path)
        assert result == {}

    def test_none_path_returns_empty(self):
        """config_path=None 返回空 dict。"""
        result = load_plugin_config(None)
        assert result == {}

    def test_explicit_disabled(self, tmp_path: Path):
        """enabled = false 显式禁用。"""
        config_path = tmp_path / "plugins.toml"
        config_path.write_text(
            dedent("""\
            [plugins.worker]
            enabled = false

            [plugins.auth]
            enabled = true
        """)
        )
        result = load_plugin_config(config_path)
        assert result["worker"] is False
        assert result["auth"] is True

    def test_env_var_expansion(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """${ENV_VAR:default} 格式正确展开。"""
        monkeypatch.setenv("MY_TOGGLE", "true")
        config_path = tmp_path / "plugins.toml"
        config_path.write_text(
            dedent("""\
            [plugins.worker]
            enabled = "${MY_TOGGLE:false}"
        """)
        )
        result = load_plugin_config(config_path)
        assert result["worker"] is True

    def test_env_var_default_value(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """环境变量不存在时使用默认值。"""
        monkeypatch.delenv("NONEXISTENT_VAR", raising=False)
        config_path = tmp_path / "plugins.toml"
        config_path.write_text(
            dedent("""\
            [plugins.schedule]
            enabled = "${NONEXISTENT_VAR:false}"
        """)
        )
        result = load_plugin_config(config_path)
        assert result["schedule"] is False

    def test_env_var_no_default(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """${ENV_VAR} 无默认值且变量不存在 → 视为 false。"""
        monkeypatch.delenv("MISSING", raising=False)
        config_path = tmp_path / "plugins.toml"
        config_path.write_text(
            dedent("""\
            [plugins.worker]
            enabled = "${MISSING}"
        """)
        )
        result = load_plugin_config(config_path)
        assert result["worker"] is False

    def test_env_var_truthy_values(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """true/True/1/yes 都解析为 True。"""
        for val in ("true", "True", "TRUE", "1", "yes"):
            monkeypatch.setenv("TOGGLE", val)
            config_path = tmp_path / "plugins.toml"
            config_path.write_text(
                dedent("""\
                [plugins.x]
                enabled = "${TOGGLE:false}"
            """)
            )
            result = load_plugin_config(config_path)
            assert result["x"] is True, f"Expected True for TOGGLE={val}"
