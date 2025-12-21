import json
import os
from pathlib import Path


def flatten_json(prefix: str, data: dict[str, str]) -> dict[str, str]:
    """
    Flattens a nested JSON-like dictionary into a single-level dictionary with keys
    constructed from the original keys and their nesting structure.

    Args:
        prefix: A string to be prepended to the keys in the resulting dictionary.
                Used internally for recursion. Should be left empty when calling
                this function initially.
        data: The dictionary to flatten. Can contain nested dictionaries.

    Returns:
        A new dictionary with flattened keys and values from the input dictionary.
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
    Loads and flattens locales from a specified directory.

    The function iterates through all language directories within the given root
    directory, processes each JSON file found in these directories, and flattens
    the data. The flattened data is then stored in a dictionary with the language
    as the key and the flattened locale data as the value.

    Args:
        root_dir: The path to the directory containing the language subdirectories.
            Each subdirectory should contain JSON files representing different
            namespaces of localized strings.

    Returns:
        A dictionary where each key is a language (subdirectory name) and the value
        is another dictionary that contains the flattened locale data for that
        language. The structure of the inner dictionary is such that it maps
        fully-qualified keys (namespace.key) to their corresponding localized string
        values.
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
    Loads a set of language namespaces from the specified root directory.

    Args:
        root_dir: The root directory to search for language namespaces. Can be a string or a Path object.

    Returns:
        A set containing the names of the language namespaces found in the root directory.
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
    Generates a string representation of a Python Literal type from a dictionary.
    The generated string can be used to define a Literal type in Python, which is
    useful for creating type-safe enums or constants based on the keys of a given
    dictionary. The keys of the dictionary are sorted and each key is represented
    as a string literal within the Literal type.

    Args:
        data: A dictionary whose keys will be used to generate the Literal type.
        name: The name of the Literal type to be generated. Defaults to "I18nKey".
        indent: The number of spaces to use for indentation in the generated string.
                This affects the readability of the output. Defaults to 4.

    Returns:
        A string that represents the definition of a Python Literal type, with
        the keys of the input dictionary as its possible values.
    """
    space = " " * indent
    lines = [f"{name} = Literal["]
    for key in sorted(data.keys()):
        lines.append(f'{space}"{key}",')
    lines.append("]")
    return "\n".join(lines)


def write_py_file(path: str | Path, content: str) -> None:
    """
    Writes content to a Python file at the specified path.

    Args:
        path: The path where the file will be written. Can be a string or a Path object.
        content: The content to be written into the file.

    Returns:
        None
    """
    path = Path(path)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def resolve_language(
    accept_language: str | None,
    supported_languages: set[str],
) -> str | None:
    """
    Resolves the most appropriate language based on the client's accept-language header and
     the server's supported languages.

    Args:
        accept_language: A string representing the client's preferred languages, as specified in
         the 'Accept-Language' HTTP header.
        supported_languages: A set of strings, each representing a language code that the server supports.

    Returns:
        A string representing the most suitable language code from the server's supported languages,
         or the default language if no match is found.
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
