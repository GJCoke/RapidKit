"""
Script domain dependencies.

Author  : Coke
Date    : 2026-03-31
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from rapidkit_common.deps import SessionDep

from plugin_script.crud import ScriptCRUD, ScriptExecutionCRUD
from plugin_script.models import Script, ScriptExecution


async def get_script_crud(session: SessionDep) -> ScriptCRUD:
    """提供 ScriptCRUD 实例。"""
    return ScriptCRUD(Script, session=session)


ScriptCrudDep = Annotated[
    ScriptCRUD,
    Depends(get_script_crud),
    Doc("依赖项：提供用于脚本操作的 ScriptCRUD 实例。"),
]


async def get_script_exec_crud(session: SessionDep) -> ScriptExecutionCRUD:
    """提供 ScriptExecutionCRUD 实例。"""
    return ScriptExecutionCRUD(ScriptExecution, session=session)


ScriptExecCrudDep = Annotated[
    ScriptExecutionCRUD,
    Depends(get_script_exec_crud),
    Doc("依赖项：提供用于脚本执行记录操作的 ScriptExecutionCRUD 实例。"),
]
