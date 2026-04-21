"""
数据规则 CRUD。

Author : Coke
Date   : 2026-04-20
"""

from rapidkit_common.crud import BaseCRUD

from plugin_auth.data_rule.models import DataRule


class DataRuleCRUD(BaseCRUD[DataRule]):
    """数据规则数据操作。"""

    model = DataRule
