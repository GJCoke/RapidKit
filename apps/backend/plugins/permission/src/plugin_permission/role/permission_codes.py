# apps/backend/plugins/permission/src/plugin_permission/role/permission_codes.py
"""
角色权限码校验：保存时拒绝未知码，加载时拆出失效码供界面标红。

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Iterable

from rapidkit_framework.exceptions import AppException

from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.status_codes import RbacStatusCode


def split_permission_codes(codes: Iterable[str], catalog: PermissionCatalog) -> tuple[list[str], list[str]]:
    """
    按目录拆分为 (有效码, 失效码)，均去重并保持原顺序。

    Args:
        codes: 角色存储或请求提交的码。
        catalog: 当前目录。

    Returns:
        (有效码, 失效码)。
    """
    valid: list[str] = []
    invalid: list[str] = []
    for code in dict.fromkeys(codes):
        (valid if code in catalog.codes else invalid).append(code)
    return valid, invalid


def ensure_known_codes(codes: Iterable[str], catalog: PermissionCatalog) -> list[str]:
    """
    保存前校验，存在未知码时拒绝。

    Raises:
        AppException: ``UNKNOWN_PERMISSION_CODE``，``data`` 为 ``{"codes": [...]}``。
    """
    valid, invalid = split_permission_codes(codes, catalog)
    if invalid:
        raise AppException(RbacStatusCode.UNKNOWN_PERMISSION_CODE, data={"codes": invalid})
    return valid
