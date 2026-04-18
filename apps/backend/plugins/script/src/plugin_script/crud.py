"""
Script domain CRUD.

Author  : Coke
Date    : 2026-03-31
"""

from rapidkit_common.crud import BaseCRUD

from plugin_script.models import Script, ScriptExecution


class ScriptCRUD(BaseCRUD[Script]):
    """Script CRUD 操作。"""

    model = Script


class ScriptExecutionCRUD(BaseCRUD[ScriptExecution]):
    """ScriptExecution CRUD 操作。"""

    model = ScriptExecution
