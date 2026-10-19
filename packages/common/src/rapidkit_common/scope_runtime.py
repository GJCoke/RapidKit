# packages/common/src/rapidkit_common/scope_runtime.py
"""
请求级数据范围运行时。

- 行过滤绑定在请求会话的 ``session.info`` 上：``do_orm_execute`` 为主资源模型的 SELECT / UPDATE / DELETE
  追加 ``with_loader_criteria``；``after_flush`` 用同一条件复查本次新增与修改的行。
- 字段规则写入请求级 ``ContextVar`` 供序列化使用，并绑定到会话供 ``before_flush`` 拒绝受控字段写入。

未绑定的会话（Celery 任务、启动脚本、``AsyncSessionLocal()`` 新建会话）不受影响。

Author : Coke
Date   : 2026-10-19
"""

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Literal

from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy import ColumnElement, event, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession
from sqlalchemy.orm import ORMExecuteState, Session, UOWTransaction, with_loader_criteria
from sqlalchemy.sql import visitors
from starlette.types import ASGIApp, Receive, Scope, Send

from rapidkit_common.field_permission import get_masker

RestrictedMode = Literal["masked", "hidden"]
FieldRules = Mapping[type, Mapping[str, RestrictedMode]]

_SCOPE_KEY = "rapidkit_scope"
_UNSCOPED_KEY = "rapidkit_unscoped"
_FIELD_RULES_KEY = "rapidkit_field_rules"
UNSCOPED_OPTION = "rapidkit_unscoped"

_field_rules: ContextVar[FieldRules | None] = ContextVar("rapidkit_field_rules", default=None)
_installed = False


class ScopeContextMiddleware:
    """隔离请求字段规则，响应发送结束（含异常）后恢复调用方上下文。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return
        token = _field_rules.set({})
        try:
            await self.app(scope, receive, send)
        finally:
            _field_rules.reset(token)


@dataclass(frozen=True)
class BoundScope:
    """绑定到会话的主资源范围。"""

    model: type
    condition: ColumnElement[bool]


def _sync(session: Any) -> Session:
    return session.sync_session if isinstance(session, _AsyncSession) else session


def bind_session_scope(session: Any, model: type, condition: ColumnElement[bool]) -> None:
    """为本次请求会话绑定主资源范围。"""
    _sync(session).info[_SCOPE_KEY] = BoundScope(model=model, condition=condition)


def get_session_scope(session: Any) -> BoundScope | None:
    """读取会话绑定的范围。"""
    return _sync(session).info.get(_SCOPE_KEY)


def bind_session_field_rules(session: Any, rules: FieldRules) -> None:
    """为本次请求会话绑定字段规则，用于拒绝受控字段写入。"""
    _sync(session).info[_FIELD_RULES_KEY] = rules


@contextmanager
def unscoped(session: Any) -> Iterator[None]:
    """
    在代码块内关闭行过滤（含写入复查），用于必须看全量数据的检查。

    使用位置由 ``apps/backend/scripts/report_unscoped.py`` 列出，供代码评审检查。
    """
    info = _sync(session).info
    info[_UNSCOPED_KEY] = info.get(_UNSCOPED_KEY, 0) + 1
    try:
        yield
    finally:
        info[_UNSCOPED_KEY] -= 1


def set_field_rules(rules: FieldRules) -> None:
    """设置当前请求的字段规则（模型 → 字段 → 受控状态）。"""
    _field_rules.set(rules)


def get_field_rules() -> FieldRules:
    """读取当前请求的字段规则；未设置时为空。"""
    return _field_rules.get() or {}


def apply_field_rules(data: dict[str, Any], model: type, *, aliases: Mapping[str, str] | None = None) -> dict[str, Any]:
    """
    按当前请求的字段规则处理一条来自 ``model`` 的数据。

    Args:
        data: 序列化后的字段字典。
        model: 数据来源模型。
        aliases: 字段名到输出 key 的映射（按别名序列化时传入）。

    Returns:
        脱敏、移除后的字典；无规则时原样返回。
    """
    rules = get_field_rules().get(model)
    if not rules:
        return data
    keys = aliases or {}
    result = dict(data)
    for field, mode in rules.items():
        key = keys.get(field, field)
        if key not in result:
            continue
        if mode == "hidden":
            result.pop(key)
        else:
            result[key] = get_masker(field)(result[key])
    return result


def _is_unscoped(state_session: Session) -> bool:
    return state_session.info.get(_UNSCOPED_KEY, 0) > 0


def _apply_criteria(state: ORMExecuteState) -> None:
    bound: BoundScope | None = state.session.info.get(_SCOPE_KEY)
    if state.is_update and state.bind_mapper is not None:
        model = state.bind_mapper.class_
        values = getattr(state.statement, "_values", None) or {}
        ordered_values = getattr(state.statement, "_ordered_values", None) or ()
        written = {getattr(key, "key", key) for key in values}
        written.update(getattr(key, "key", key) for key, _ in ordered_values)
        # 按主键批量 UPDATE 的主键参数用于定位行，不属于被修改的值。
        primary_keys = {column.key for column in state.bind_mapper.primary_key}
        parameters = state.parameters
        if isinstance(parameters, Mapping) and not values and not ordered_values:
            written.update(parameters)
        if isinstance(parameters, list):
            for params in parameters:
                written.update(set(params) - primary_keys)
        restricted = state.session.info.get(_FIELD_RULES_KEY, {}).get(model, {})
        if written.intersection(restricted):
            raise AppException(StatusCode.FIELD_WRITE_DENIED)
        if (
            bound is not None
            and model is bound.model
            and not (_is_unscoped(state.session) or state.execution_options.get(UNSCOPED_OPTION))
        ):
            scope_columns = {
                node.key
                for node in visitors.iterate(bound.condition)
                if getattr(node, "table", None) is not None and hasattr(node, "key")
            }
            if written.intersection(scope_columns):
                # 批量 DML 没有 flush 后复查，范围列修改必须通过受跟踪 ORM 对象。
                raise AppException(StatusCode.RESOURCE_OUT_OF_SCOPE)
    if bound is None or _is_unscoped(state.session) or state.execution_options.get(UNSCOPED_OPTION):
        return
    # 已识别对象的过期属性重载不再过滤：对象在加载时已经过范围检查
    if state.is_column_load or not (state.is_select or state.is_update or state.is_delete):
        return
    state.statement = state.statement.options(with_loader_criteria(bound.model, bound.condition, include_aliases=True))


def _check_written_rows(session: Session, _flush_context: UOWTransaction) -> None:
    bound: BoundScope | None = session.info.get(_SCOPE_KEY)
    if bound is None or _is_unscoped(session):
        return
    ids = {
        obj.id for obj in (*session.new, *session.dirty) if isinstance(obj, bound.model) and obj not in session.deleted
    }
    if not ids:
        return
    primary_key = getattr(bound.model, "id")
    statement = select(func.count()).select_from(bound.model).where(primary_key.in_(ids), bound.condition)
    if session.connection().execute(statement).scalar_one() != len(ids):
        raise AppException(StatusCode.RESOURCE_OUT_OF_SCOPE)


def _check_field_writes(session: Session, _flush_context: UOWTransaction, _instances: Any) -> None:
    rules: FieldRules | None = session.info.get(_FIELD_RULES_KEY)
    if not rules:
        return
    for obj in session.new:
        restricted = rules.get(type(obj))
        if restricted and any(getattr(obj, field, None) is not None for field in restricted):
            raise AppException(StatusCode.FIELD_WRITE_DENIED)
    for obj in session.dirty:
        restricted = rules.get(type(obj))
        if not restricted:
            continue
        attrs = inspect(obj).attrs
        if any(field in attrs and attrs[field].history.has_changes() for field in restricted):
            raise AppException(StatusCode.FIELD_WRITE_DENIED)


def install_scope_listeners() -> None:
    """在 SQLAlchemy ``Session`` 上注册范围监听；重复调用无副作用。"""
    global _installed
    if _installed:
        return
    event.listen(Session, "do_orm_execute", _apply_criteria)
    event.listen(Session, "before_flush", _check_field_writes)
    event.listen(Session, "after_flush", _check_written_rows)
    _installed = True
