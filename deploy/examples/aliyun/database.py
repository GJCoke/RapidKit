"""Example PostgreSQL logical backup and checked-in Alembic migration hook."""

import json
import shutil
import sys
from pathlib import Path

from support import HookError, compose_run, container_ids, main, read, run, save, sha256


def postgres(context, arguments, output=None):
    ids = container_ids(context, ["postgresql"])
    if len(ids) != 1:
        raise HookError("Expected one existing PostgreSQL container")
    info = json.loads(run(["docker", "inspect", ids[0]]))[0]
    values = dict(value.split("=", 1) for value in info["Config"]["Env"] if "=" in value)
    username = values.get("POSTGRESQL_USERNAME", "postgres")
    database = values.get("POSTGRESQL_DATABASE", username)
    # Password stays in the container environment, never argv or host output.
    script = 'export PGPASSWORD="${POSTGRESQL_PASSWORD:-$POSTGRESQL_POSTGRES_PASSWORD}"; exec "$@"'
    return run(
        [
            "docker",
            "exec",
            ids[0],
            "sh",
            "-c",
            script,
            "release-pg",
            *arguments,
            "--username",
            username,
            "--dbname",
            database,
        ],
        output=output,
    )


def revisions(context):
    exists = postgres(
        context,
        ["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", "SELECT to_regclass('public.alembic_version') IS NOT NULL"],
    ).strip()
    if exists != "t":
        raise HookError("Production database has no Alembic history; import explicitly before CD")
    return sorted(
        postgres(
            context,
            [
                "psql",
                "-XAt",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                "SELECT version_num FROM alembic_version ORDER BY version_num",
            ],
        ).split()
    )


def execute(action, context):
    if action == "inspect":
        migrating = any(
            json.loads(run(["docker", "inspect", identifier]))[0]["State"]["Running"]
            for identifier in container_ids(context, ["backend-migrate"])
        )
        size = int(
            postgres(
                context, ["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", "SELECT pg_database_size(current_database())"]
            ).strip()
        )
        if shutil.disk_usage(context["root"]).free < size * 3 + 256 * 1024**2:
            raise HookError("Insufficient space for backup and round-trip verification")
        return {
            "database_size": size,
            "migration_running": migrating,
            "revisions": revisions(context),
            "server_version": postgres(
                context, ["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", "SHOW server_version"]
            ).strip(),
        }
    if action == "backup":
        directory = Path(context["work_dir"]) / "backups"
        directory.mkdir(mode=0o700, exist_ok=False)
        data = directory / "database.dump"
        with data.with_suffix(".partial").open("xb") as stream:
            postgres(context, ["pg_dump", "--format=custom", "--no-password"], output=stream)
        data.with_suffix(".partial").replace(data)
        # pg_restore --list validates the archive format, not full restorability.
        ids = container_ids(context, ["postgresql"])
        run(["docker", "cp", str(data), f"{ids[0]}:/tmp/rapidkit-{context['release_id']}.dump"])
        try:
            run(["docker", "exec", ids[0], "pg_restore", "--list", f"/tmp/rapidkit-{context['release_id']}.dump"])
        finally:
            run(["docker", "exec", ids[0], "rm", "-f", f"/tmp/rapidkit-{context['release_id']}.dump"])
        roles = directory / "globals.sql"
        # pg_dumpall uses --database rather than pg_dump/psql's --dbname; supply via connection string-free wrapper.
        info = json.loads(run(["docker", "inspect", ids[0]]))[0]
        values = dict(v.split("=", 1) for v in info["Config"]["Env"] if "=" in v)
        with roles.open("xb") as stream:
            run(
                [
                    "docker",
                    "exec",
                    ids[0],
                    "sh",
                    "-c",
                    'export PGPASSWORD="${POSTGRESQL_PASSWORD:-$POSTGRESQL_POSTGRES_PASSWORD}"; exec "$@"',
                    "release-pg",
                    "pg_dumpall",
                    "--globals-only",
                    "--no-role-passwords",
                    "--no-password",
                    "--username",
                    values.get("POSTGRESQL_USERNAME", "postgres"),
                    "--database",
                    values.get("POSTGRESQL_DATABASE", "postgres"),
                ],
                output=stream,
            )
        if data.stat().st_size == 0 or roles.stat().st_size == 0:
            raise HookError("Empty database backup")
        result = {
            "backup_id": context["release_id"],
            "files": [{"path": str(p), "sha256": sha256(p)} for p in (data, roles)],
            **execute("inspect", context),
        }
        save(directory / "metadata.json", {k: v for k, v in result.items() if k != "files"})
        return result
    if action == "migrate":
        compose_run(context, ["run", "--rm", "--no-deps", "-T", "backend-migrate"])
        script = (
            "import json; from alembic.config import Config; from alembic.script import ScriptDirectory; "
            "print('RELEASE_JSON='+json.dumps(sorted(ScriptDirectory.from_config(Config('alembic.ini')).get_heads())))"
        )
        output = compose_run(context, ["run", "--rm", "--no-deps", "-T", "backend-api", "python", "-c", script])
        target = json.loads(
            next(line.removeprefix("RELEASE_JSON=") for line in output.splitlines() if line.startswith("RELEASE_JSON="))
        )
        return {"revisions": revisions(context), "target_revisions": target}
    if action == "check-compatibility":
        before = context["results"].get("database.backup", {}).get("revisions")
        previous_revisions = before
        if context.get("previous"):
            previous = read(Path(context["root"]) / "releases" / context["previous"]["release_id"] / "state.json")
            previous_revisions = previous["results"].get("database.migrate", previous["results"]["database.inspect"])[
                "revisions"
            ]
        # Never guess backward compatibility across a changed schema, even if a hook failed transactionally.
        completed = context["results"].get("database.migrate", {})
        return {
            "compatible": bool(before)
            and bool(completed)
            and revisions(context) == before
            and previous_revisions == before
            and completed.get("revisions") == before
            and completed.get("target_revisions") == before
        }
    raise HookError("Unsupported database action")


if __name__ == "__main__":
    sys.exit(main(execute))
