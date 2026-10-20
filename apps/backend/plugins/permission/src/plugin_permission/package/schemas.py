"""服务器声明功能包的只读契约。"""

from typing import Literal

from rapidkit_common.schemas import BaseModel

FieldModeValue = Literal["visible", "masked", "hidden"]


class PackageResponse(BaseModel):
    key: str
    label: str
    description: str
    codes: list[str]
    data_scopes: dict[str, str]
    field_modes: dict[str, dict[str, FieldModeValue]]
