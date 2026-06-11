"""
Field permission services and helpers.

Author : Coke
Date   : 2026-05-13
"""

from typing import Any, Literal

from rapidkit_common.field_permission import FieldRestrictions
from rapidkit_framework.exceptions import AppException

from plugin_permission.field_guard.maskers import get_masker
from plugin_permission.status_codes import RbacStatusCode


def build_field_restrictions(
    policies: list,
    *,
    action: Literal["read", "write"],
    model_tablename: str,
) -> FieldRestrictions:
    """
    Build aggregated field restrictions from field policies.

    Filters by target_model and action, then collects fields by effect.
    """
    restrictions = FieldRestrictions()

    relevant = [p for p in policies if p.target_model == model_tablename and action in p.actions]

    for policy in relevant:
        if policy.effect == "strip":
            restrictions.stripped.extend(f for f in policy.fields if f not in restrictions.stripped)
        elif policy.effect == "mask":
            restrictions.masked.extend(f for f in policy.fields if f not in restrictions.masked)
        elif policy.effect == "deny":
            restrictions.denied.extend(f for f in policy.fields if f not in restrictions.denied)

    return restrictions


def serialize_with_restrictions(data: dict[str, Any], restrictions: FieldRestrictions) -> dict[str, Any]:
    """
    Apply field restrictions to a response dict.

    - stripped fields are removed
    - masked fields have values replaced with masked versions
    """
    if restrictions.is_empty:
        return data

    result = {}
    for key, value in data.items():
        if key in restrictions.stripped:
            continue
        elif key in restrictions.masked:
            masker = get_masker(key)
            result[key] = masker(value)
        else:
            result[key] = value

    return result


def apply_field_write_restrictions(data: dict[str, Any], restrictions: FieldRestrictions) -> dict[str, Any]:
    """
    Apply field restrictions to incoming write data.

    - stripped/masked fields are silently removed
    - denied fields raise AppException if present
    """
    # Check denied fields first
    for denied_field in restrictions.denied:
        if denied_field in data:
            raise AppException(RbacStatusCode.FIELD_WRITE_DENIED)

    # Remove stripped/masked fields
    result = {
        key: value for key, value in data.items() if key not in restrictions.stripped and key not in restrictions.masked
    }

    return result
