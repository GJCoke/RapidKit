from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def migration_history():
    root = Path(__file__).parents[1]
    config = Config()
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("path_separator", "os")
    config.set_main_option(
        "version_locations", ":".join(str(path) for path in sorted((root / "plugins").glob("*/migrations/versions")))
    )
    return ScriptDirectory.from_config(config)


def test_deployed_revisions_remain_resolvable():
    history = migration_history()
    for revision in (
        "079c70bca399",
        "auth_imp_20261015",
        "c8f27d61a903",
        "d73a2bf8c619",
        "d83e41a926c0",
        "e4c8a19b720f",
        "f4846582dae5",
        "perm_static_catalog_20261019",
        "sys_imp_20261015",
    ):
        assert history.get_revision(revision) is not None


def test_audit_upgrade_continues_from_the_deployed_system_branch():
    history = migration_history()
    assert history.get_revision("system@head").revision == "20261021_audit_targets"
    assert [step.revision for step in history.iterate_revisions("system@head", "sys_imp_20261015")] == [
        "20261021_audit_targets",
        "20261021_audit_v2",
    ]
