"""
扩展导出为代码声明：帮助开发者把有效扩展固化回代码基线。

Author : Coke
Date   : 2026-10-17
"""

import json
from collections.abc import Iterable, Mapping

from plugin_permission.catalog.extensions import ExtensionState


def render_export(
    states: Iterable[ExtensionState],
    route_bindings: Mapping[str, str],
    *,
    generated_at: str,
) -> str:
    """
    把 active 扩展渲染为可粘贴的代码与修改说明；cleanable / invalid 不导出。

    Args:
        states: 目录中的扩展判定结果。
        route_bindings: route_key → 接口声明码。
        generated_at: 生成时间文本（本地时区）。

    Returns:
        导出文本。
    """
    active = [state.extension for state in states if state.status == "active"]
    lines = [f"# 由权限扩展层导出，生成时间 {generated_at}"]
    if not active:
        lines.append("# 当前没有生效的扩展")
        return "\n".join(lines) + "\n"

    customs = [ext for ext in active if ext.kind == "custom_code"]
    depends = [ext for ext in active if ext.kind == "depends"]
    bindings = [ext for ext in active if ext.kind == "route_binding"]

    if customs:
        lines += ["", "# 自定义权限码：加入所属插件 register() 的 permission_codes"]
        lines += [
            f"PermissionCodeDef(code={json.dumps(ext.code)}, "
            f"label={json.dumps(ext.label or ext.code, ensure_ascii=False)}, "
            f"abac_action={json.dumps(ext.abac_action)}),"
            for ext in customs
        ]
    if depends:
        lines += ["", "# 追加依赖：在下列权限码声明的 depends 中加入"]
        lines += [f'# {ext.code} → depends 追加 "{ext.depends_on}"' for ext in depends]
    if bindings:
        lines += [
            "",
            "# 接口绑定：以下接口声明码与扩展码不同，二选一固化：",
            "#   1) 给扩展码的 depends 加上接口声明码；2) 调整接口的 Require",
        ]
        lines += [
            f'# {ext.route_key}  当前 Require("{route_bindings.get(ext.route_key or "", "?")}")  扩展允许: {ext.code}'
            for ext in bindings
        ]
    return "\n".join(lines) + "\n"
