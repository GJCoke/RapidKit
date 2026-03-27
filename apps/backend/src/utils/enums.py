from enum import Enum


class MenuIconType(str, Enum):
    ICONIFY = "1"  # iconify 图标
    LOCAL = "2"  # 本地图标


class MenuType(str, Enum):
    DIRECTORY = "1"  # 目录
    MENU = "2"  # 菜单


class Status(str, Enum):
    ON = "1"  # 启用
    OFF = "2"  # 禁用
