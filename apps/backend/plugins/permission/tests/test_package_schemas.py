"""功能包请求结构测试。"""

import pytest
from pydantic import ValidationError

from plugin_permission.package.schemas import ApplyPackagesBody, PackageCreate, PackageUpdate


def test_custom_key_must_have_prefix():
    with pytest.raises(ValidationError):
        PackageCreate(key="user.mine", label="x", codes=["user:read"])
    assert PackageCreate(key="custom.ops-team", label="x", codes=["user:read"]).key == "custom.ops-team"


def test_codes_required_and_deduplicated():
    with pytest.raises(ValidationError):
        PackageCreate(key="custom.a", label="x", codes=[])
    assert PackageCreate(key="custom.a", label="x", codes=["user:read", "user:read"]).codes == ["user:read"]


def test_update_codes_cannot_be_empty_when_set():
    with pytest.raises(ValidationError):
        PackageUpdate(codes=[])
    assert PackageUpdate(label="y").model_dump(exclude_unset=True) == {"label": "y"}


def test_apply_body_defaults_to_merge_and_requires_keys():
    body = ApplyPackagesBody.model_validate({"packageKeys": ["user.full"]})
    assert body.mode == "merge"
    with pytest.raises(ValidationError):
        ApplyPackagesBody.model_validate({"packageKeys": []})
    with pytest.raises(ValidationError):
        ApplyPackagesBody.model_validate({"packageKeys": ["user.full"], "mode": "append"})


@pytest.mark.parametrize("field", ["label", "description", "codes", "dataScopes", "fieldModes"])
def test_update_rejects_explicit_null(field):
    with pytest.raises(ValidationError):
        PackageUpdate.model_validate({field: None})
