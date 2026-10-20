"""
服务器代码功能包：内容校验与一次性应用到角色。

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Mapping
from dataclasses import dataclass
from uuid import UUID

from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import PermissionPackageDef, PluginManifest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.catalog.registry import build_catalog, get_catalog
from plugin_permission.models import Role
from plugin_permission.package.rules import (
    ApplyMode,
    Grant,
    GrantDiff,
    diff_grants,
    find_unknown_codes,
    merge_grants,
)
from plugin_permission.scope_rules import ensure_valid_scopes, resolve_role_scopes
from plugin_permission.status_codes import RbacStatusCode


@dataclass(frozen=True)
class ApplyResult:
    """应用功能包后的角色与差异。"""

    role: Role
    diff: GrantDiff


async def validate_package_content(
    codes: list[str],
    data_scopes: Mapping[str, str],
    field_modes: Mapping[str, Mapping[str, str]],
) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """
    校验功能包内容：码必须存在于当前目录，范围与字段状态必须是已声明的选项。

    Returns:
        保留显式 all / visible 的 (数据范围, 字段状态)，用于应用时覆盖角色原有限制。

    Raises:
        AppException: PACKAGE_INVALID_CODES / PACKAGE_INVALID_SCOPES。
    """
    catalog = get_catalog()
    if find_unknown_codes(codes, catalog.codes.keys()):
        raise AppException(RbacStatusCode.PACKAGE_INVALID_CODES)
    return ensure_valid_scopes(
        data_scopes, field_modes, catalog, error=RbacStatusCode.PACKAGE_INVALID_SCOPES, preserve_defaults=True
    )


def collect_builtin_packages(manifests: list[PluginManifest]) -> list[PermissionPackageDef]:
    """
    汇总插件声明的内置功能包并校验 key 唯一、码存在。

    Raises:
        CatalogError: key 重复或引用了目录中不存在的码。
    """
    return list(build_catalog(manifests, {}).packages.values())


async def apply_packages_to_role(
    session: AsyncSession,
    role_id: UUID,
    package_keys: list[str],
    mode: ApplyMode,
) -> ApplyResult:
    """
    将功能包一次性展开写入角色（不提交事务，不发布变更）。

    Raises:
        AppException: 角色或功能包不存在、功能包内容已失效。
    """
    keys = list(dict.fromkeys(package_keys))
    declared = get_catalog().packages
    if any(key not in declared for key in keys):
        raise AppException(RbacStatusCode.PACKAGE_NOT_FOUND)
    packages = [declared[key] for key in keys]

    role = (
        await session.exec(
            select(Role).where(Role.id == role_id).with_for_update().execution_options(populate_existing=True)
        )
    ).first()
    if role is None:
        raise AppException(RbacStatusCode.ROLE_NOT_FOUND)

    effective = resolve_role_scopes(role.data_scopes or {}, role.field_modes or {}, get_catalog())
    before = Grant(
        codes=tuple(role.permission_codes or []),
        data_scopes=effective.data_scopes,
        field_modes=effective.field_modes,
    )
    package_grants = [Grant(codes=package.codes) for package in packages]
    # 只校验功能包带入的内容；角色上已有的残留码按 P2 规则在加载时忽略，不阻塞应用
    for grant in package_grants:
        await validate_package_content(list(grant.codes), dict(grant.data_scopes), dict(grant.field_modes))
    after = merge_grants(before, package_grants, mode)

    role.permission_codes = list(after.codes)
    role.data_scopes = dict(after.data_scopes)
    role.field_modes = {resource: dict(groups) for resource, groups in after.field_modes.items()}
    session.add(role)
    await session.flush()
    await session.refresh(role)
    return ApplyResult(role=role, diff=diff_grants(before, after))
