"""
基础模型数据结构。

本模块定义了应用中使用的基础模型数据结构。

Author : Coke
Date   : 2025-03-24
"""

from pydantic import AliasGenerator, ConfigDict
from pydantic import BaseModel as _BaseModel
from pydantic.alias_generators import to_camel
from pydantic.main import IncEx


class BaseModel(_BaseModel):
    """基础数据结构。"""

    model_config = ConfigDict(
        alias_generator=AliasGenerator(alias=to_camel),  # Use camel case for field names and aliases.
        populate_by_name=True,  # Allow populating fields by both name and alias.
    )

    def serializable_dict(
        self,
        include: IncEx | None = None,
        exclude: IncEx | None = None,
        by_alias: bool = True,
        exclude_unset: bool = False,
        exclude_defaults: bool = False,
        exclude_none: bool = False,
    ) -> dict:
        """
        将对象转换为可 JSON 序列化的字典，并使用别名。

        该方法确保模型可方便地转换为兼容 JSON 的字典格式，支持字段别名。

        示例：
            class MyModel(BaseModel):
                page_size: int

            model = MyModel(pageSize=1)
            model.serializable_dict()
            >> {"pageSize": 1}

        Args:
            include: 输出包含的字段白名单。
            exclude: 输出排除的字段黑名单，优先生效。
            by_alias: 是否使用字段别名。
            exclude_unset: 是否排除未显式设置的字段。
            exclude_defaults: 是否排除等于默认值的字段。
            exclude_none: 是否排除值为 None 的字段。

        Returns:
            dict: 可 JSON 序列化的模型字典。
        """

        return self.model_dump(
            mode="json",
            include=include,
            exclude=exclude,
            by_alias=by_alias,
            exclude_unset=exclude_unset,
            exclude_defaults=exclude_defaults,
            exclude_none=exclude_none,
        )
