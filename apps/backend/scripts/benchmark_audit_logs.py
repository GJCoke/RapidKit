"""Populate an explicitly confirmed test database and time common audit queries.

Usage: uv run python scripts/benchmark_audit_logs.py --database-url URL \
    --confirm-test-database --rows 1000000
"""

import argparse
import asyncio
import math
import time
from datetime import timedelta
from urllib.parse import urlparse

from plugin_system.audit_crud import AuditLogCRUD
from plugin_system.models import AuditLog
from plugin_system.schemas import AuditLogQuery
from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7
from sqlalchemy import event, inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession


async def benchmark(url: str, rows: int) -> None:
    engine = create_async_engine(url)
    run_id = str(uuid7())
    now = timezone.now()
    actors = [uuid7() for _ in range(100)]
    async with engine.begin() as connection:
        for start in range(0, rows, 1000):
            batch = [
                {
                    "id": uuid7(),
                    "actor_type": "system",
                    "actor_id": actors[index % len(actors)],
                    "actor_name": "Benchmark",
                    "action": "benchmark.sample",
                    "resource_type": "audit-benchmark",
                    "resource_id": f"{run_id}:{index % 1000}",
                    "result": "success",
                    "risk_level": "normal",
                    "source": "system",
                    "request_id": f"{run_id}:{index}",
                    "correlation_id": run_id,
                    "metadata": {},
                    "occurred_at": now - timedelta(seconds=index % 86400),
                }
                for index in range(start, min(start + 1000, rows))
            ]
            await connection.execute(inspect(AuditLog).local_table.insert(), batch)
    cases = {
        "recent": AuditLogQuery(start_time=now - timedelta(days=1), end_time=now + timedelta(seconds=1)),
        "actor": AuditLogQuery(actor_id=actors[0], start_time=now - timedelta(days=1)),
        "object": AuditLogQuery(resource_type="audit-benchmark", resource_id=f"{run_id}:0"),
        "request": AuditLogQuery(request_id=f"{run_id}:0"),
        "correlation": AuditLogQuery(correlation_id=run_id),
    }
    async with AsyncSession(engine) as session:
        crud = AuditLogCRUD(session)
        for name, query in cases.items():
            durations = []
            statements = []

            def capture(connection, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT") and len(statements) < 2:
                    statements.append((statement, parameters))

            event.listen(engine.sync_engine, "before_cursor_execute", capture)
            try:
                for _ in range(20):
                    started = time.monotonic()
                    await crud.get_audit_page(query)
                    durations.append((time.monotonic() - started) * 1000)
            finally:
                event.remove(engine.sync_engine, "before_cursor_execute", capture)
            durations.sort()
            print(f"{name}: p50={durations[9]:.1f}ms p95={durations[math.ceil(len(durations) * 0.95) - 1]:.1f}ms")
            prefix = "EXPLAIN (ANALYZE, BUFFERS) " if engine.dialect.name == "postgresql" else "EXPLAIN QUERY PLAN "
            connection = await session.connection()
            for statement, parameters in statements:
                plan = await connection.exec_driver_sql(prefix + statement, parameters)
                print(f"{name} plan: {plan.all()}")
    await engine.dispose()
    print(f"Synthetic run {run_id}; added {rows} rows. No existing rows were removed.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--confirm-test-database", action="store_true")
    parser.add_argument("--rows", type=int, default=1000000)
    args = parser.parse_args()
    database = urlparse(args.database_url).path.strip("/")
    if not args.confirm_test_database or not database.startswith("test") or args.rows < 1:
        parser.error("An explicitly confirmed test-prefixed database and positive row count are required")
    asyncio.run(benchmark(args.database_url, args.rows))


if __name__ == "__main__":
    main()
