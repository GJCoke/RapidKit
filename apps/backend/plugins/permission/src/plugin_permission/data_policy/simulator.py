"""
Policy simulator — dry-run a set of policies against a target user.

Author : Coke
Date   : 2026-05-06
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from plugin_user.models import User
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.plugin import get_loaded_models
from rapidkit_policy_engine import TemplateContext, resolve_rule_tree
from sqlmodel import func, or_, select, true
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.data_policy.crud import DataPolicyCRUD
from plugin_permission.data_policy.schemas import PolicyAppliedDetail, PolicySimulateRequest, PolicySimulateResponse

logger = get_plugin_logger("Permission")


async def simulate_policies(
    body: PolicySimulateRequest,
    session: AsyncSession,
) -> PolicySimulateResponse:
    """Execute a dry-run simulation of policies for a given user."""
    crud = DataPolicyCRUD(session)
    policies = await crud.get_by_ids(body.policy_ids)
    if not policies:
        return _empty_response()

    target_user = await session.get(User, body.target_user_id)
    if target_user is None:
        return _empty_response()

    target_model_name = policies[0].target_model
    models_map = get_loaded_models()
    model_class = models_map.get(target_model_name)
    if model_class is None:
        return _empty_response()

    # Admin users bypass DataPermissionFilter entirely in production
    if target_user.is_admin:
        total_stmt = select(func.count()).select_from(model_class)
        total_count = await session.scalar(total_stmt) or 0
        preview_stmt = select(model_class).limit(body.preview_limit)
        preview_result = await session.exec(preview_stmt)
        preview_rows = [_model_to_dict(row) for row in preview_result.all()]
        return PolicySimulateResponse(
            target_model=target_model_name,
            target_model_label=model_class.__name__,
            total_count=total_count,
            filtered_count=total_count,
            excluded_count=0,
            preview_rows=preview_rows,
            excluded_rows=[],
            generated_sql="TRUE (admin bypass)",
            policies_applied=[],
            is_admin_bypass=True,
        )

    ctx = TemplateContext(user=target_user, now=timezone.now())
    models_map = get_loaded_models()

    clauses = []
    applied_info: list[PolicyAppliedDetail] = []

    for policy in policies:
        if policy.target_model != target_model_name:
            continue
        clause = resolve_rule_tree(policy.rule, ctx, model_class, models_map=models_map, session=session)
        clauses.append(clause)

        count_stmt = select(func.count()).select_from(model_class).where(clause)
        matched_count = await session.scalar(count_stmt) or 0

        sql_str = str(clause.compile(compile_kwargs={"literal_binds": True}))
        applied_info.append(
            PolicyAppliedDetail(
                policy_id=policy.id,
                policy_name=policy.name,
                matched_count=matched_count,
                sql_fragment=sql_str,
            )
        )

    combined = or_(*clauses) if clauses else true()
    combined_sql = str(combined.compile(compile_kwargs={"literal_binds": True}))

    total_stmt = select(func.count()).select_from(model_class)
    total_count = await session.scalar(total_stmt) or 0

    filtered_stmt = select(func.count()).select_from(model_class).where(combined)
    filtered_count = await session.scalar(filtered_stmt) or 0

    excluded_count = total_count - filtered_count

    preview_stmt = select(model_class).where(combined).limit(body.preview_limit)
    preview_result = await session.exec(preview_stmt)
    preview_rows = [_model_to_dict(row) for row in preview_result.all()]

    # Use "IS NOT TRUE" to correctly capture rows where condition is FALSE or NULL
    excluded_stmt = select(model_class).where(combined.is_not(True)).limit(body.preview_limit)
    excluded_result = await session.exec(excluded_stmt)
    excluded_rows = [_model_to_dict(row) for row in excluded_result.all()]

    return PolicySimulateResponse(
        target_model=target_model_name,
        target_model_label=model_class.__name__,
        total_count=total_count,
        filtered_count=filtered_count,
        excluded_count=excluded_count,
        preview_rows=preview_rows,
        excluded_rows=excluded_rows,
        generated_sql=combined_sql,
        policies_applied=applied_info,
    )


def _model_to_dict(obj) -> dict:
    """Convert a SQLModel instance to a serializable dict."""
    data = {}
    for key in obj.__class__.model_fields:
        val = getattr(obj, key, None)
        if isinstance(val, UUID):
            data[key] = str(val)
        elif isinstance(val, datetime):
            data[key] = val.isoformat()
        elif isinstance(val, date):
            data[key] = val.isoformat()
        elif isinstance(val, Decimal):
            data[key] = float(val)
        else:
            data[key] = val
    return data


def _empty_response() -> PolicySimulateResponse:
    return PolicySimulateResponse(
        target_model="",
        target_model_label="",
        total_count=0,
        filtered_count=0,
        excluded_count=0,
        preview_rows=[],
        excluded_rows=[],
        generated_sql="",
        policies_applied=[],
    )
