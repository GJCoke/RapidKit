from enum import Enum, IntEnum


class MenuIconType(str, Enum):
    ICONIFY = "1"  # iconify 图标
    LOCAL = "2"  # 本地图标


class MenuType(str, Enum):
    DIRECTORY = "1"  # 目录
    MENU = "2"  # 菜单


class Status(str, Enum):
    ON = "1"  # 启用
    OFF = "2"  # 禁用


class WorkerStatus(str, Enum):
    ONLINE = "1"
    OFFLINE = "2"


class TaskStatus(str, Enum):
    PENDING = "1"
    STARTED = "2"
    SUCCESS = "3"
    FAILURE = "4"
    RETRY = "5"
    REVOKED = "6"


class DataScope(IntEnum):
    """数据范围枚举。"""

    ALL = 1  # 全部数据
    SELF = 2  # 仅自己创建的
    DEPT = 3  # 本部门
    DEPT_AND_CHILDREN = 4  # 本部门及下级
    CUSTOM_DEPT = 5  # 自定义部门列表
    CUSTOM_RULE = 6  # 自定义规则
