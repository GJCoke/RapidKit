"""
Environment enum constant.

Defines the possible environments for the application and includes helper properties
to determine the environment's specific characteristics.

Author : Coke
Date   : 2025-03-11
"""

from enum import Enum

DB_NAMING_CONVENTION = {
    "ix": "%(column_0_label)s_idx",
    "uq": "%(table_name)s_%(column_0_name)s_key",
    "ck": "%(table_name)s_%(constraint_name)s_check",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}


class Environment(str, Enum):
    """
    应用环境枚举常量。

    定义了应用可用的环境类型，并包含判断环境特性的辅助属性。
    """

    LOCAL = "LOCAL"
    STAGING = "STAGING"
    TESTING = "TESTING"
    PRODUCTION = "PRODUCTION"

    @property
    def is_dev(self) -> bool:
        """
        判断是否为本地开发环境。

        Returns:
            如果为 LOCAL 环境返回 True。
        """
        return self == self.LOCAL

    @property
    def is_debug(self) -> bool:
        """
        判断是否为调试环境（LOCAL、STAGING 或 TESTING）。

        Returns:
            如果为 LOCAL、STAGING 或 TESTING 环境返回 True。
        """
        return self in (self.LOCAL, self.STAGING, self.TESTING)

    @property
    def is_testing(self) -> bool:
        """
        判断是否为测试环境。

        Returns:
            如果为 TESTING 环境返回 True。
        """
        return self == self.TESTING

    @property
    def is_deployed(self) -> bool:
        """
        判断是否为已部署环境（STAGING 或 PRODUCTION）。

        Returns:
            如果为 STAGING 或 PRODUCTION 环境返回 True。
        """
        return self in (self.STAGING, self.PRODUCTION)
