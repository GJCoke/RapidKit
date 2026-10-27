"""Opt-in isolated Docker checks: no existing containers, ports or volumes are modified."""

import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("RUN_RELEASE_DOCKER_TESTS") != "1", reason="isolated Docker opt-in")
EXAMPLES = Path(__file__).parents[1] / "examples/aliyun"


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def load(name):
    sys.path.insert(0, str(EXAMPLES))
    spec = importlib.util.spec_from_file_location("integration_" + name, EXAMPLES / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_real_postgres_backup_roundtrip_and_restore(tmp_path):
    project = "rapidkit-release-test-" + uuid4().hex[:10]
    name = project + "-pg"
    docker("run", "-d", "--name", name, "--network", "none", "--label",
           f"com.docker.compose.project={project}", "--label", "com.docker.compose.service=postgresql",
           "-e", "POSTGRES_USER=root", "-e", "POSTGRES_PASSWORD=test-only", "-e", "POSTGRES_DB=client",
           "-e", "POSTGRESQL_USERNAME=root", "-e", "POSTGRESQL_PASSWORD=test-only",
           "-e", "POSTGRESQL_DATABASE=client", "postgres:16-alpine")
    try:
        for _ in range(50):
            if subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "root", "-d", "client"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(0.2)
        docker("exec", name, "psql", "-U", "root", "-d", "client", "-v", "ON_ERROR_STOP=1", "-c",
               "CREATE TABLE alembic_version(version_num varchar(32) PRIMARY KEY);"
               "INSERT INTO alembic_version VALUES ('before-release');"
               "CREATE TABLE important_data(id integer PRIMARY KEY, value text);"
               "INSERT INTO important_data VALUES (1, 'recover me');")
        work = tmp_path / "work"
        work.mkdir()
        ctx = {"release_id": "integration", "work_dir": str(work), "root": str(tmp_path),
               "options": {"project_name": project}, "manifest": {"release_id": "integration"}, "results": {}}
        database = load("database")
        backup = database.execute("backup", ctx)
        assert backup["revisions"] == ["before-release"]
        assert len(backup["files"]) == 2
        # Simulate the storage service through a real CLI executable, not the storage hook itself.
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        oss = bin_dir / "ossutil"
        oss.write_text('''#!/usr/bin/env python3
import os,sys,shutil
from pathlib import Path
a=sys.argv[1:]; root=Path(os.environ['TEST_OSS_ROOT'])
if 'ls' in a: raise SystemExit(0)
i=a.index('cp'); source,target=a[i+1:i+3]
def path(p): return root/p.removeprefix('oss://') if p.startswith('oss://') else Path(p)
s,t=path(source),path(target);t.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s,t)
''')
        oss.chmod(0o755)
        previous = dict(os.environ)
        os.environ.update(PATH=str(bin_dir) + ":" + os.environ["PATH"], TEST_OSS_ROOT=str(tmp_path / "oss"),
                          OSS_ENDPOINT="https://oss-test-internal.aliyuncs.com", OSS_REGION="cn-test", OSS_BUCKET="test-bucket")
        try:
            storage = load("storage")
            ctx["results"]["database.backup"] = backup
            for action in ("put", "verify", "commit"):
                ctx["results"]["storage." + action] = storage.execute(action, ctx)
            restored = storage.execute("get", ctx)
            assert restored["verified"] is True
        finally:
            os.environ.clear()
            os.environ.update(previous)
        docker("exec", name, "createdb", "-U", "root", "restored")
        archive = Path(restored["directory"]) / "database.dump"
        docker("cp", str(archive), name + ":/tmp/restored.dump")
        docker("exec", name, "pg_restore", "-U", "root", "-d", "restored", "--exit-on-error", "/tmp/restored.dump")
        value = docker("exec", name, "psql", "-U", "root", "-d", "restored", "-At", "-c",
                       "SELECT value FROM important_data WHERE id=1")
        assert value == "recover me"
    finally:
        docker("rm", "-f", "-v", name)


def test_real_nginx_maintenance_blocks_all_entry_paths(tmp_path):
    support = load("support")
    bundle = tmp_path / "bundle"
    (bundle / "docker/prod").mkdir(parents=True)
    source = Path(__file__).resolve().parents[2] / "docker/prod/nginx.conf"
    (bundle / "docker/prod/nginx.conf").write_text(source.read_text())
    root, work = tmp_path / "root", tmp_path / "work"
    root.mkdir()
    ctx = {"root": str(root), "bundle": str(bundle), "work_dir": str(work), "release_id": "r1",
           "env_file": str(tmp_path / "unused.env"), "options": {},
           "manifest": {"artifacts": {"backend": "test", "frontend": "test"}}}
    previous_umask = os.umask(0o077)
    try:
        support.compose(ctx)
    finally:
        os.umask(previous_umask)
    template = (work / "nginx.conf").read_text().replace("${MAX_REQUEST_BODY_BYTES}", "10485760").replace(
        "${SECURITY_HSTS_ENABLED}", "false").replace("http://minio:9000/", "http://127.0.0.1:9000/")
    (work / "nginx.conf").write_text(template)
    headers = Path(__file__).resolve().parents[2] / "docker/prod/security-headers.conf"
    name = "rapidkit-release-nginx-test-" + uuid4().hex[:10]
    docker("run", "-d", "--name", name, "--network", "none", "-v", str(work / "nginx.conf") + ":/etc/nginx/nginx.conf:ro",
           "-v", str(headers) + ":/etc/nginx/security-headers.conf:ro", "-v",
           str(root / "maintenance") + ":/run/rapidkit-release:ro", "nginx:stable-alpine")
    try:
        time.sleep(0.5)
        docker("exec", name, "nginx", "-t")
        (root / "maintenance/enabled").touch()
        for path in ("/", "/api/v1/users", "/socket.io/", "/minio/file", "/assets/file.js"):
            output = subprocess.run(["docker", "exec", name, "wget", "-S", "-O", "/dev/null",
                                      "http://127.0.0.1" + path], capture_output=True, text=True)
            assert "503" in output.stderr, output.stderr
        (root / "maintenance/enabled").unlink()
        output = subprocess.run(["docker", "exec", name, "wget", "-S", "-O", "/dev/null", "http://127.0.0.1/"],
                                capture_output=True, text=True)
        assert "200 OK" in output.stderr
    finally:
        docker("rm", "-f", name)


def test_checked_in_migrations_upgrade_clean_postgres_to_all_heads(tmp_path):
    name = "rapidkit-release-migration-test-" + uuid4().hex[:10]
    docker("run", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_USER=test",
           "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test", "postgres:16-alpine")
    try:
        for _ in range(50):
            if subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "test", "-d", "test"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(0.2)
        port = docker("port", name, "5432/tcp").rsplit(":", 1)[1]
        env = dict(os.environ, ENVIRONMENT="TESTING", POSTGRESQL_ASYNC_SCHEME="postgresql+asyncpg",
                   POSTGRESQL_SYNC_SCHEME="postgresql+psycopg", POSTGRESQL_USERNAME="test", POSTGRESQL_PASSWORD="test",
                   POSTGRESQL_HOST="127.0.0.1", POSTGRESQL_PORT=port, POSTGRESQL_DATABASE="test",
                   REDIS_HOST="127.0.0.1", REDIS_ROOT_PASSWORD="", MINIO_ROOT_USER="test", MINIO_ROOT_PASSWORD="test1234",
                   CORS_ORIGINS='["*"]', CORS_HEADERS='["*"]')
        cwd = Path(__file__).resolve().parents[2] / "apps/backend"
        for command in (("upgrade", "heads"), ("check",)):
            result = subprocess.run([sys.executable, "-m", "alembic", *command], cwd=cwd, env=env,
                                    capture_output=True, text=True, timeout=120)
            (tmp_path / (command[0] + ".log")).write_text(result.stdout + result.stderr)
            assert result.returncode == 0, (result.stdout + result.stderr)[-4000:]
    finally:
        docker("rm", "-f", "-v", name)
