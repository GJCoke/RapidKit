from enum import StrEnum

from sqlalchemy import Enum as SQLAlchemyEnum


def _varchar_enum(enum_type: type[StrEnum]) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_type,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )
