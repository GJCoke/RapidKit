"""Preserve Solar coordinates as floating-point numbers.

Revision ID: d83e41a926c0
Revises: baefb869cf5b
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op

revision = "d83e41a926c0"
down_revision = "baefb869cf5b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("schedule_solar_schedules") as batch:
        for name in ("latitude", "longitude"):
            batch.alter_column(name, existing_type=sa.Integer(), type_=sa.Float(), existing_nullable=False)


def downgrade() -> None:
    fractional = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT 1 FROM schedule_solar_schedules WHERE latitude != CAST(latitude AS INTEGER) "
                "OR longitude != CAST(longitude AS INTEGER) LIMIT 1"
            )
        )
        .first()
    )
    if fractional:
        raise ValueError("Cannot downgrade Solar coordinates while fractional values exist")
    with op.batch_alter_table("schedule_solar_schedules") as batch:
        for name in ("latitude", "longitude"):
            batch.alter_column(
                name,
                existing_type=sa.Float(),
                type_=sa.Integer(),
                existing_nullable=False,
                postgresql_using=f"{name}::integer",
            )
