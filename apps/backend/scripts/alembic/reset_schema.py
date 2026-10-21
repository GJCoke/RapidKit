"""Rebuild the public schema in the database configured for this backend."""

import asyncio

from rapidkit_core.config import settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def main() -> None:
    engine = create_async_engine(str(settings.ASYNC_DATABASE_POSTGRESQL_URL))
    try:
        async with engine.begin() as connection:
            await connection.execute(text("DROP SCHEMA public CASCADE"))
            await connection.execute(text("CREATE SCHEMA public"))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
