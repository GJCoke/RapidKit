"""
Script domain CRUD.

Author  : Coke
Date    : 2026-03-31
"""

from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_common.schemas import BaseModel

from plugin_script.models import Script, ScriptExecution
from plugin_script.schemas import ScriptCreate, ScriptUpdate


class ScriptCRUD(BaseSQLModelCRUD[Script, ScriptCreate, ScriptUpdate]):
    """Script CRUD 操作。"""


class ScriptExecutionCRUD(BaseSQLModelCRUD[ScriptExecution, BaseModel, BaseModel]):
    """ScriptExecution CRUD 操作（仅使用 dict 创建，不使用 schema）。"""
