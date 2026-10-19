"""
接口监控插件的资源与权限码声明。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_framework.plugin import PermissionCodeDef, ResourceDef

from plugin_monitoring.models import ApiMetricsHourly

RESOURCES = [ResourceDef(key="monitoring", label="API 监控", model=ApiMetricsHourly)]

PERMISSION_CODES = [PermissionCodeDef(code="monitoring:read", label="查看 API 监控", abac_action="read")]
