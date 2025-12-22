import json
import os
from pathlib import Path


def flatten_json(prefix: str, data: dict[str, str]) -> dict[str, str]:
    """
    将嵌套化的类 JSON 字典整平成单水平的字典，键是上一水平的键和其嵌套结构构成。

    Args:
        prefix: 要附加到结果字典中键的前缀字符串。内部用于递归。最初调用时应为空。
        data: 要整平的字典。可以包含嵌套的字典。

    Returns:
        一个新的字典，输入字典中的键和值已整平。
    """
    result: dict[str, str] = {}

    for key, value in data.items():
        new_key = f"{prefix}.{key}" if prefix else key

        if isinstance(value, dict):
            result.update(flatten_json(new_key, value))
        else:
            result[new_key] = value

    return result


def load_and_flatten_locales(root_dir: str | Path) -> dict[str, dict[str, str]]:
    """
    从指定目录加载和整平本地化。

    该函数遍历根目录中的所有语言子目录，处理这些
    目录中找到的每个 JSON 文件，并整平数据。然后将其存储在以语言
    为键、整平的本地化数据为值的字典中。

    Args:
        root_dir: 指向包含语言子目录的目录的路径。每个子目录应上是一个
        表示本地化字符串的不同整合的 JSON 文件。

    Returns:
        一个字典，每个键是语言（子目录名称），值是另一个
        本地化数据。内部字典的结构是将全限定键
        （namespace.key）映射到其对应的本地化字符串值。
    """
    all_locales: dict[str, dict[str, str]] = {}

    for lang in os.listdir(root_dir):
        lang_path = os.path.join(root_dir, lang)

        if not os.path.isdir(lang_path):
            continue

        flat_dict: dict[str, str] = {}

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


def load_language_namespace(root_dir: str | Path) -> set[str]:
    """
    从指定根目录加载语言整合。

    Args:
        root_dir: 要搜索语言整合的根目录。可以是字符串或 Path 对象。

    Returns:
        一个集合，包含根目录中找到的语言整合的名称。
    """
    languages: set[str] = set()
    for lang in os.listdir(root_dir):
        languages.add(lang)

    return languages


def gen_literal_from_dict(
    data: dict,
    name: str = "I18nKey",
    indent: int = 4,
) -> str:
    """
    从字典生成 Python Literal 类型的字符串表示。
    生成的字符串可以用于在 Python 中定义 Literal 类型，这
    对于根据给定字典的键创建类型安全的枚举或常量很有用。
    字典的键是排序的，每个键被表示为 Literal 类型中的字符串字根。

    Args:
        data: 一个字典，其键将用于生成 Literal 类型。
        name: 要生成的 Literal 类型的名称。默认为 "I18nKey"。
        indent: 用于在生成的字符串中输入的空格个数。这会
                影响输出的可读性。默认为 4。

    Returns:
        一个表示 Python Literal 类型定义的字符串，其中的加入列表是输入字典的键。
    """
    space = " " * indent
    lines = [f"{name} = Literal["]
    for key in sorted(data.keys()):
        lines.append(f'{space}"{key}",')
    lines.append("]")
    return "\n".join(lines)


def write_py_file(path: str | Path, content: str) -> None:
    """
    将内容写入特定路径的 Python 文件。

    Args:
        path: 要写入文件的路径。可以是字符串或 Path 对象。
        content: 要写入文件中的内容。

    Returns:
        无。
    """
    path = Path(path)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def resolve_language(
    accept_language: str | None,
    supported_languages: set[str],
) -> str | None:
    """
    基于客户端的 accept-language 标头和服务器支持的语言
    解决最不算特的语言。

    Args:
        accept_language: 一个表示客户端优先语言的字符串，其中
         作为 'Accept-Language' HTTP 标头指定。
        supported_languages: 一个普普通通遍历，每个数串表示了一个服务器支持的语言代码。

    Returns:
        一个表示服务器支持的语言代码中最合需的一个语言
         代码，如果找不到匹配则返回无。
    """

    supported = set(supported_languages)

    if not accept_language:
        return None

    candidates: list[tuple[str, float]] = []

    for part in accept_language.split(","):
        part = part.strip()
        if not part:
            continue

        if ";q=" in part:
            lang, q = part.split(";q=", 1)
            try:
                weight = float(q)
            except ValueError:
                weight = 0.0
        else:
            lang = part
            weight = 1.0

        candidates.append((lang, weight))

    candidates.sort(key=lambda x: x[1], reverse=True)

    for lang, _ in candidates:
        if lang in supported:
            return lang

        base = lang.split("-", 1)[0]
        for s in supported:
            if s.startswith(base):
                return s
