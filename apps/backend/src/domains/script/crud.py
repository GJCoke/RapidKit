"""
Script domain CRUD.

Author  : Claude
Date    : 2026-03-31
"""

from src.common.crud import BaseSQLModelCRUD
from src.common.schemas import BaseModel
from src.domains.script.models import Script, ScriptExecution
from src.domains.script.schemas import ScriptCreate, ScriptUpdate


class ScriptCRUD(BaseSQLModelCRUD[Script, ScriptCreate, ScriptUpdate]):
    """Script CRUD 操作。"""


class ScriptExecutionCRUD(BaseSQLModelCRUD[ScriptExecution, BaseModel, BaseModel]):
    """ScriptExecution CRUD 操作（仅使用 dict 创建，不使用 schema）。"""
