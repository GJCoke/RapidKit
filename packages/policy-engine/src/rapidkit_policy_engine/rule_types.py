from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter, field_validator


class ConditionNode(BaseModel):
    type: Literal["condition"]
    field: str
    operator: str
    value: str = ""

    @field_validator("field")
    @classmethod
    def field_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("field must not be empty")
        return v

    @field_validator("operator")
    @classmethod
    def operator_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("operator must not be empty")
        return v


class GroupNode(BaseModel):
    type: Literal["group"]
    logic: Literal["AND", "OR"]
    conditions: list[RuleNode]


class SubqueryNode(BaseModel):
    type: Literal["subquery"]
    field: str
    operator: str = "in"
    model: str
    target_field: str = "id"
    filter: RuleNode | None = None

    @field_validator("field")
    @classmethod
    def field_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("field must not be empty")
        return v

    @field_validator("model")
    @classmethod
    def model_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("model must not be empty")
        return v


RuleNode = Annotated[
    Union[ConditionNode, GroupNode, SubqueryNode],
    Field(discriminator="type"),
]

GroupNode.model_rebuild()
SubqueryNode.model_rebuild()

_rule_node_adapter: TypeAdapter[RuleNode] = TypeAdapter(RuleNode)


def parse_rule(raw: dict) -> RuleNode:
    """Validate a raw dict into a typed RuleNode."""
    return _rule_node_adapter.validate_python(raw)
