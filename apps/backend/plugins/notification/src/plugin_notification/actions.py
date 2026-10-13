"""Validate menu bindings and resolve publication navigation snapshots."""

import re
from typing import Any, NoReturn
from urllib.parse import quote
from uuid import UUID

from rapidkit_common.auth import UserProtocol
from rapidkit_common.protocols.menu import MenuNavigationProvider
from rapidkit_common.protocols.notification import LocalizedActionLabel
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import validate_action

_PATH_PARAMETER = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?([?*+]?)")
_OPTIONAL_PATH_SEGMENT = re.compile(r"/:([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?[?*](?=/|$)")


def _invalid() -> NoReturn:
    raise AppException(NotificationStatusCode.INVALID_ACTION_ROUTE)


def _text(value: Any) -> str:
    return str(value).lower() if isinstance(value, bool) else str(value)


async def resolve_action(
    action: dict[str, Any] | None,
    *,
    session: AsyncSession,
    user: UserProtocol | None = None,
    provider: MenuNavigationProvider | None = None,
    snapshot: bool = True,
) -> dict[str, Any] | None:
    """Read-only validation; drafts keep bindings and publications keep snapshots."""
    validate_action(action)
    if action is None:
        return None
    labels = {}
    if action.get("label") is not None:
        labels["label"] = action["label"]
    if action.get("localized_label") is not None:
        localized = LocalizedActionLabel.model_validate(action["localized_label"])
        labels.update(
            label=localized.translations[localized.default_locale],
            localized_label=localized.model_dump(mode="json", by_alias=True),
        )
    if action.get("type") == "external":
        return {"type": "external", "url": action["url"], **labels}
    if action.get("type") != "menu":
        return {**{key: action[key] for key in ("route", "params") if action.get(key) is not None}, **labels}
    navigation = provider or get_service(MenuNavigationProvider)
    target = await navigation.get_target(session, UUID(str(action["menu_id"])), user)
    if target is None:
        _invalid()
    supplied = {"path": action.get("params", {}), "query": action.get("query", {})}
    resolved = {"path": {}, "query": {}}
    for location in ("path", "query"):
        definitions = {p.name: p for p in target.parameters if p.location == location}
        if supplied[location].keys() - definitions.keys():
            _invalid()
        for name, parameter in definitions.items():
            value = supplied[location].get(name, parameter.default_value)
            if value is None or value == "":
                if parameter.required:
                    _invalid()
                if value is None or location == "path":
                    continue
            resolved[location][name] = _text(value)

    def substitute(match: re.Match) -> str:
        value = resolved["path"].get(match[1])
        if value is None:
            return ""
        if value in {".", ".."}:
            _invalid()
        if match[2]:
            try:
                if re.fullmatch(match[2], value) is None:
                    _invalid()
            except re.error:
                _invalid()
        return quote(value, safe="")

    # Vue Router removes the whole segment when a standalone optional param is absent.
    template = _OPTIONAL_PATH_SEGMENT.sub(lambda match: match[0] if match[1] in resolved["path"] else "", target.path)
    path = _PATH_PARAMETER.sub(substitute, template) or "/"
    if len(path) > 2048 or not path.startswith("/") or path.startswith("//") or "#" in path or "?" in path:
        _invalid()
    result = {
        "type": "menu",
        "menu_id": str(target.menu_id),
        "params": action.get("params", {}),
        "query": action.get("query", {}),
    }
    result.update(labels)
    if snapshot:
        result.update(route=target.route, path=path, params=resolved["path"], query=resolved["query"])
    return result
