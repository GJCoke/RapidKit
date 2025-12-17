import json
import os
from typing import Any


def flatten_json(prefix: str, data: dict[str, Any]) -> dict[str, Any]:
    """递归扁平化 JSON"""
    result = {}

    for key, value in data.items():
        new_key = f"{prefix}.{key}" if prefix else key

        if isinstance(value, dict):
            result.update(flatten_json(new_key, value))
        else:
            result[new_key] = value

    return result


def load_and_flatten_locales(root_dir: str) -> dict[str, dict[str, str]]:
    """
    扫描:
        root/en-US/*.json
        root/zh-CN/*.json
    并扁平化内容
    """
    all_locales = {}

    for lang in os.listdir(root_dir):
        lang_path = os.path.join(root_dir, lang)

        if not os.path.isdir(lang_path):
            continue

        flat_dict = {}

        for filename in os.listdir(lang_path):
            if filename.endswith(".json"):
                file_path = os.path.join(lang_path, filename)
                namespace = filename.replace(".json", "")  # common.json -> common

                with open(file_path, "r", encoding="utf-8") as f:
                    json_data = json.load(f)

                # 扁平化并合入
                flat_dict.update(flatten_json(namespace, json_data))

        all_locales[lang] = flat_dict

    return all_locales


def gen_literal_from_dict(
    data: dict,
    name: str = "I18nKey",
    indent: int = 4,
) -> str:
    space = " " * indent
    lines = [f"{name} = Literal["]
    for key in sorted(data.keys()):
        lines.append(f'{space}"{key}",')
    lines.append("]")
    return "\n".join(lines)


# 使用示例
if __name__ == "__main__":
    path = os.path.join(os.path.dirname(__file__), "src", "locales")
    result = load_and_flatten_locales(path)
    print(gen_literal_from_dict(result["zh-CN"]))
