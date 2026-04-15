"""
校验工具。

作者 : Coke
日期 : 2025-03-10
"""

import re


def is_valid_password(value: str) -> bool:
    """
    校验密码强度。

    Requirements:
    - 至少包含一个小写字母
    - 至少包含一个大写字母
    - 至少包含一个数字
    - 可包含字母、数字和特殊字符：@$!%*?&
    - 长度为8到20个字符
    """
    password_pattern = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,20}$")
    return bool(re.match(password_pattern, value))
