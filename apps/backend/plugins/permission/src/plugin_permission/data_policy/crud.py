"""
DataPolicy CRUD operations.

Author : Coke
Date   : 2026-04-30
"""

from rapidkit_common.crud import BaseCRUD

from plugin_permission.models import DataPolicy


class DataPolicyCRUD(BaseCRUD[DataPolicy]):
    model = DataPolicy
