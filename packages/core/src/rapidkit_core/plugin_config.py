"""
插件配置解析器 — 读取 plugins.toml，解析环境变量。

Author : Claude
Date   : 2026-04-17
"""

import os
import re
import tomllib
from pathlib import Path

_ENV_PATTERN = re.compile(r"^\$\{([^}:]+)(?::([^}]*))?\}$")
_TRUTHY = frozenset({"true", "1", "yes"})


def _resolve_env(value: str) -> bool:
    """将 ${VAR:default} 格式的字符串解析为 bool。"""
    m = _ENV_PATTERN.match(value)
    if m:
        env_name, default = m.group(1), m.group(2)
        raw = os.environ.get(env_name, default or "")
        return raw.lower() in _TRUTHY
    return value.lower() in _TRUTHY


def load_plugin_config(config_path: Path | None) -> dict[str, bool]:
    """
    读取 plugins.toml，返回插件名 → 是否启用的映射。

    未在配置中出现的插件不包含在返回值中（调用方应视为默认启用）。
    文件不存在或 config_path 为 None 时返回空 dict。

    Args:
        config_path: plugins.toml 文件路径。

    Returns:
        {plugin_name: enabled} 映射。
    """
    if config_path is None:
        return {}

    path = Path(config_path)
    if not path.is_file():
        return {}

    with open(path, "rb") as f:
        data = tomllib.load(f)

    plugins_section = data.get("plugins", {})
    result: dict[str, bool] = {}

    for name, cfg in plugins_section.items():
        if not isinstance(cfg, dict):
            continue
        enabled = cfg.get("enabled", True)
        if isinstance(enabled, bool):
            result[name] = enabled
        elif isinstance(enabled, str):
            result[name] = _resolve_env(enabled)
        else:
            result[name] = bool(enabled)

    return result
