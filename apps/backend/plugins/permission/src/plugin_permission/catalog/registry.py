"""
权限码目录：汇总插件声明的资源与权限码，校验后提供展开、反查能力。

Author : Coke
Date   : 2026-10-17
"""

import hashlib
import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, replace
from typing import Literal

from rapidkit_framework.plugin import AbacAction, PluginManifest, ResourceDef

from plugin_permission.catalog.extensions import CatalogExtension, ExtensionState, plan_extensions

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$")
RESOURCE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
ABAC_ACTIONS = ("read", "write")


class CatalogError(Exception):
    """权限码目录声明不合法。"""


@dataclass(frozen=True)
class CatalogCode:
    """目录中的一个权限码。"""

    code: str
    resource: str
    label: str
    abac_action: AbacAction
    depends: tuple[str, ...]
    source: Literal["code", "extension"]


class PermissionCatalog:
    """已校验的权限码目录。"""

    def __init__(
        self,
        resources: dict[str, ResourceDef],
        codes: dict[str, CatalogCode],
        route_codes: dict[str, set[str]],
        *,
        extra_route_codes: dict[str, frozenset[str]] | None = None,
        extension_states: tuple[ExtensionState, ...] = (),
    ) -> None:
        self.resources = resources
        self.codes = codes
        self._route_codes = route_codes
        self.extra_route_codes: dict[str, frozenset[str]] = dict(extra_route_codes or {})
        self.extension_states = extension_states

    def expand(self, codes: Iterable[str]) -> set[str]:
        """传递展开 ``depends``，忽略目录中不存在的码。"""
        result: set[str] = set()
        stack = [code for code in codes if code in self.codes]
        while stack:
            code = stack.pop()
            if code in result:
                continue
            result.add(code)
            stack.extend(dep for dep in self.codes[code].depends if dep not in result)
        return result

    def codes_for_route(self, route_key: str) -> set[str]:
        """可访问该接口的码：声明码 ∪ 扩展绑定。"""
        return set(self._route_codes.get(route_key, ())) | set(self.extra_route_codes.get(route_key, frozenset()))

    def bound_codes(self) -> set[str]:
        """至少绑定了一个接口的权限码（含扩展绑定）。"""
        declared = {code for codes in self._route_codes.values() for code in codes}
        return declared | {code for codes in self.extra_route_codes.values() for code in codes}

    def allows(self, code: str, route_key: str, user_codes: Iterable[str]) -> bool:
        """持有的码与可访问该接口的码有交集即放行；接口未登记时退回到声明码。"""
        allowed = self.codes_for_route(route_key) or {code}
        return not allowed.isdisjoint(user_codes)

    def resource_of(self, code: str) -> ResourceDef:
        """权限码所属资源。"""
        entry = self.codes.get(code)
        if entry is None:
            raise CatalogError(f"Unknown permission code: {code}")
        return self.resources[entry.resource]

    def digest(self) -> str:
        """目录内容哈希，含扩展；用于目录版本判定。"""
        payload = {
            "resources": sorted(
                [
                    key,
                    resource.label,
                    [[scope.key, scope.label] for scope in resource.data_scopes],
                    [
                        [group.key, group.label, list(group.fields), list(group.modes)]
                        for group in resource.field_groups
                    ],
                ]
                for key, resource in self.resources.items()
            ),
            "codes": sorted(
                [entry.code, entry.label, entry.abac_action, list(entry.depends), entry.source]
                for entry in self.codes.values()
            ),
            "routes": {key: sorted(codes) for key, codes in sorted(self._route_codes.items())},
            "extra": {key: sorted(codes) for key, codes in sorted(self.extra_route_codes.items())},
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _duplicates(keys: list[str]) -> list[str]:
    return sorted({key for key in keys if keys.count(key) > 1})


def _check_scopes(resource: ResourceDef, errors: list[str]) -> None:
    """校验资源声明的数据范围与字段组。"""
    if not resource.data_scopes and not resource.field_groups:
        return
    model = resource.model
    if model is None:
        errors.append(f"Resource '{resource.key}' declares data scopes or field groups but has no model")
        return
    for key in _duplicates([scope.key for scope in resource.data_scopes]):
        errors.append(f"Resource '{resource.key}' has duplicate data scope '{key}'")
    for scope in resource.data_scopes:
        if any(getattr(column, "class_", None) is not model for column in scope.columns):
            errors.append(
                f"Data scope '{resource.key}.{scope.key}' references a column outside model '{model.__name__}'"
            )
    for key in _duplicates([group.key for group in resource.field_groups]):
        errors.append(f"Resource '{resource.key}' has duplicate field group '{key}'")
    columns = set(getattr(model, "__table__").columns.keys())
    owners: dict[str, str] = {}
    for group in resource.field_groups:
        for field in group.fields:
            if field not in columns:
                errors.append(f"Field group '{resource.key}.{group.key}' references unknown field '{field}'")
            elif field in owners and owners[field] != group.key:
                errors.append(
                    f"Field '{resource.key}.{field}' belongs to field groups '{owners[field]}' and '{group.key}'"
                )
            else:
                owners[field] = group.key


def _collect_resources(manifests: list[PluginManifest], errors: list[str]) -> dict[str, ResourceDef]:
    resources: dict[str, ResourceDef] = {}
    for manifest in manifests:
        for resource in manifest.resources:
            if not RESOURCE_PATTERN.match(resource.key):
                errors.append(f"Invalid resource key '{resource.key}' in plugin '{manifest.name}'")
            elif resource.key in resources:
                errors.append(f"Duplicate resource '{resource.key}' in plugin '{manifest.name}'")
            else:
                resources[resource.key] = resource
                _check_scopes(resource, errors)
    return resources


def _collect_codes(
    manifests: list[PluginManifest],
    resources: dict[str, ResourceDef],
    errors: list[str],
) -> dict[str, CatalogCode]:
    codes: dict[str, CatalogCode] = {}
    for manifest in manifests:
        for definition in manifest.permission_codes:
            if not CODE_PATTERN.match(definition.code):
                errors.append(f"Invalid permission code '{definition.code}' in plugin '{manifest.name}'")
                continue
            resource = definition.code.split(":", 1)[0]
            if resource not in resources:
                errors.append(f"Permission code '{definition.code}' references unknown resource '{resource}'")
                continue
            if definition.code in codes:
                errors.append(f"Duplicate permission code '{definition.code}' in plugin '{manifest.name}'")
                continue
            if definition.abac_action not in ABAC_ACTIONS:
                errors.append(f"Invalid abac_action '{definition.abac_action}' for '{definition.code}'")
                continue
            codes[definition.code] = CatalogCode(
                code=definition.code,
                resource=resource,
                label=definition.label,
                abac_action=definition.abac_action,
                depends=tuple(definition.depends),
                source="code",
            )
    return codes


def _find_cycles(codes: dict[str, CatalogCode]) -> list[str]:
    errors: list[str] = []
    state: dict[str, int] = {}

    def visit(code: str, path: list[str]) -> None:
        state[code] = 1
        for dep in codes[code].depends:
            if dep not in codes:
                continue
            if state.get(dep) == 1:
                cycle = path[path.index(dep) :] + [dep]
                errors.append("Permission code dependency cycle: " + " -> ".join(cycle))
            elif dep not in state:
                visit(dep, path + [dep])
        state[code] = 2

    for code in sorted(codes):
        if code not in state:
            visit(code, [code])
    return errors


def _build_baseline(manifests: list[PluginManifest], route_bindings: dict[str, str]) -> PermissionCatalog:
    """
    汇总并校验插件声明。

    Args:
        manifests: 已加载的插件清单。
        route_bindings: 路由键到其声明权限码的映射（见 ``collect_route_bindings``）。

    Returns:
        已校验的目录。

    Raises:
        CatalogError: 任一声明不合法，消息包含全部错误。
    """
    errors: list[str] = []
    resources = _collect_resources(manifests, errors)
    codes = _collect_codes(manifests, resources, errors)
    for entry in codes.values():
        for dep in entry.depends:
            if dep not in codes:
                errors.append(f"Permission code '{entry.code}' depends on unknown code '{dep}'")
    errors.extend(_find_cycles(codes))

    route_codes: dict[str, set[str]] = {}
    for route_key, code in route_bindings.items():
        if code not in codes:
            errors.append(f"Route '{route_key}' requires unknown permission code '{code}'")
        else:
            route_codes.setdefault(route_key, set()).add(code)

    if errors:
        raise CatalogError("\n".join(errors))
    return PermissionCatalog(resources, codes, route_codes)


def build_catalog(
    manifests: list[PluginManifest],
    route_bindings: dict[str, str],
    extensions: Iterable[CatalogExtension] = (),
) -> PermissionCatalog:
    """
    构建生效目录：基线校验失败抛 CatalogError；扩展只按判定结果合并，从不抛异常。

    Args:
        manifests: 已加载插件清单。
        route_bindings: Require 声明的 route_key → 声明码。
        extensions: 扩展层记录，按创建时间升序。

    Returns:
        合并 active 扩展后的目录。
    """
    baseline = _build_baseline(manifests, route_bindings)
    items = list(extensions)
    if not items:
        return baseline

    plan = plan_extensions(baseline, route_bindings, items)
    codes = dict(baseline.codes)
    for ext in plan.custom_codes:
        codes[ext.code] = CatalogCode(
            code=ext.code,
            resource=ext.resource or "",
            label=ext.label or ext.code,
            abac_action=ext.abac_action,  # ty: ignore[invalid-argument-type]
            depends=(),
            source="extension",
        )
    for code, extra in plan.depends.items():
        codes[code] = replace(codes[code], depends=tuple(codes[code].depends) + extra)
    return PermissionCatalog(
        baseline.resources,
        codes,
        baseline._route_codes,
        extra_route_codes=plan.route_codes,
        extension_states=plan.states,
    )


_catalog: PermissionCatalog | None = None


def get_catalog() -> PermissionCatalog:
    """返回启动时构建的目录。"""
    if _catalog is None:
        raise RuntimeError("Permission catalog has not been built. Make sure the permission plugin has started.")
    return _catalog


def set_catalog(catalog: PermissionCatalog | None) -> None:
    """设置当前目录（启动时调用，测试可传 ``None`` 重置）。"""
    global _catalog
    _catalog = catalog
