"""
FieldPolicy CRUD operations.

Author : Coke
Date   : 2026-05-13
"""

from rapidkit_common.crud import BaseCRUD

from plugin_permission.field_guard.models import FieldPolicy


class FieldPolicyCRUD(BaseCRUD[FieldPolicy]):
    model = FieldPolicy
