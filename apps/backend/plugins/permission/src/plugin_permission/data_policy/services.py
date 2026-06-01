"""
DataPolicy business services.

Author : Coke
Date   : 2026-04-30
"""

from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.i18n import t
from rapidkit_framework.plugin import get_loaded_models
from rapidkit_policy_engine import get_registered_vars
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Boolean, DateTime, Integer, Numeric
from sqlmodel import Uuid as SA_UUID
from sqlmodel import inspect as sa_inspect

from plugin_permission.role.crud import RoleCRUD


async def get_role_versions(redis: AsyncRedisClient, role_codes: list[str]) -> dict[str, int]:
    """Fetch current version for each role code via mget."""
    if not role_codes:
        return {}
    keys = [f"auth:role_version:{code}" for code in role_codes]
    values = await redis.mget(keys)
    return {code: int(val) if val else 0 for code, val in zip(role_codes, values)}


async def incr_role_version(redis: AsyncRedisClient, role_code: str) -> int:
    """Increment a role's version counter."""
    return await redis.incr(f"auth:role_version:{role_code}")


def get_model_metadata() -> list[dict]:
    """
    Reflect all registered SQLModel table classes and return their metadata.
    Returns list of {name: tablename, label: class name, fields: [{name, label, type}]}
    """
    models_map = get_loaded_models()
    result = []

    for tablename, model_cls in models_map.items():
        fields = []
        mapper = sa_inspect(model_cls)
        for column in mapper.columns:
            fields.append(
                {
                    "name": column.key,
                    "label": column.comment or column.key,
                    "type": _get_column_type_name(column.type),
                }
            )
        result.append(
            {
                "name": tablename,
                "label": model_cls.__name__,
                "fields": fields,
            }
        )

    return sorted(result, key=lambda x: x["name"])


async def invalidate_policy_cache(redis: AsyncRedisClient, policy_id, session=None) -> None:
    """Invalidate a policy's cache and bump versions for affected roles."""
    await redis.delete(f"auth:policy:{policy_id}")

    if session is None:
        return

    role_crud = RoleCRUD(session)
    roles = await role_crud.get_all()
    for role in roles:
        if role.data_policy_ids and str(policy_id) in [str(pid) for pid in role.data_policy_ids]:
            await incr_role_version(redis, role.code)


async def remove_policy_from_roles(policy_id, session) -> None:
    """Remove a deleted policy ID from all roles that reference it."""

    role_crud = RoleCRUD(session)
    roles = await role_crud.get_all()

    for role in roles:
        if not role.data_policy_ids:
            continue
        str_policy_id = str(policy_id)
        if str_policy_id in [str(pid) for pid in role.data_policy_ids]:
            updated_ids = [pid for pid in role.data_policy_ids if str(pid) != str_policy_id]
            await role_crud.update_by_id(role.id, {"data_policy_ids": updated_ids})


def _get_column_type_name(col_type) -> str:
    """Map SQLAlchemy type to a simple string for frontend."""
    type_cls = type(col_type)
    if issubclass(type_cls, (PG_UUID, SA_UUID)):
        return "uuid"
    if issubclass(type_cls, (Integer,)):
        return "integer"
    if issubclass(type_cls, (Numeric,)):
        return "number"
    if issubclass(type_cls, (Boolean,)):
        return "boolean"
    if issubclass(type_cls, (DateTime,)):
        return "datetime"
    return "string"


def validate_policy_semantics(rule: dict, target_model: str) -> list[str]:
    """Validate that fields and models referenced in a rule actually exist."""
    errors: list[str] = []
    models_map = get_loaded_models()

    if target_model not in models_map:
        errors.append(f"Target model '{target_model}' is not registered")
        return errors

    model_cls = models_map[target_model]
    _check_fields_recursive(rule, model_cls, models_map, errors)
    return errors


def _check_fields_recursive(node: dict, model_cls, models_map: dict, errors: list[str]) -> None:
    """Recursively check field references in a rule tree."""
    node_type = node.get("type")

    if node_type == "condition":
        field_name = node.get("field", "")
        if field_name and not hasattr(model_cls, field_name):
            errors.append(f"Field '{field_name}' does not exist on model '{model_cls.__tablename__}'")

    elif node_type == "group":
        for child in node.get("conditions", []):
            _check_fields_recursive(child, model_cls, models_map, errors)

    elif node_type == "subquery":
        field_name = node.get("field", "")
        if field_name and not hasattr(model_cls, field_name):
            errors.append(f"Field '{field_name}' does not exist on model '{model_cls.__tablename__}'")

        sub_model_name = node.get("model", "")
        if sub_model_name and sub_model_name not in models_map:
            errors.append(f"Subquery model '{sub_model_name}' is not registered")
        elif sub_model_name:
            sub_model = models_map[sub_model_name]
            target_field = node.get("target_field", "id")
            if not hasattr(sub_model, target_field):
                errors.append(f"Field '{target_field}' does not exist on model '{sub_model_name}'")

            sub_filter = node.get("filter")
            if sub_filter:
                _check_fields_recursive(sub_filter, sub_model, models_map, errors)


def get_all_template_vars() -> list[dict]:
    """Return all available template variables (built-in + registered)."""

    builtins = [
        {"name": "user.id", "description": t("auth.templateVar.userId")},
        {"name": "user.dept_id", "description": t("auth.templateVar.userDeptId")},
        {"name": "user.dept_ids", "description": t("auth.templateVar.userDeptIds")},
        {"name": "user.roles", "description": t("auth.templateVar.userRoles")},
        {"name": "now", "description": t("auth.templateVar.now")},
        {"name": "today", "description": t("auth.templateVar.today")},
    ]

    registered = [{"name": name, "description": t(desc) if desc else name} for name, desc in get_registered_vars()]
    return builtins + registered
