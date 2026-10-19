import importlib.util
from pathlib import Path

from src._menu_seeds import build_menus
from src._permission_catalog import load_static_catalog

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/export_permission_catalog.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("export_permission_catalog", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_render_frontend_types_declares_global_union():
    script = _load_script()

    output = script.render_frontend_types(["role:read", "user:read"])

    assert output.startswith(script.HEADER)
    assert 'type PermissionCode =\n  | "role:read"\n  | "user:read"\n' in output


def test_render_admin_types_exports_const_and_type():
    script = _load_script()

    output = script.render_admin_types(["user:read"])

    assert 'export const PERMISSION_CODES = [\n  "user:read",\n] as const\n' in output
    assert "export type PermissionCode = (typeof PERMISSION_CODES)[number]\n" in output


def test_find_referenced_codes_scans_string_literals(tmp_path: Path):
    script = _load_script()
    (tmp_path / "page.vue").write_text("<NButton v-if=\"hasAuth('user:update')\" />", encoding="utf-8")
    (tmp_path / "other.ts").write_text('const route = "/user/read"; can("role:read")', encoding="utf-8")

    referenced = script.find_referenced_codes({"user:update", "role:read", "user:read"}, (tmp_path,))

    assert referenced == {"user:update", "role:read"}


def test_find_unused_codes_requires_neither_binding_nor_reference():
    script = _load_script()

    unused = script.find_unused_codes(["a:read", "b:read", "c:read"], {"a:read"}, {"b:read"})

    assert unused == ["c:read"]


def test_seed_menu_permissions_are_registered_codes():
    catalog, _ = load_static_catalog()

    missing = {menu.permission for menu in build_menus() if menu.permission} - catalog.codes.keys()

    assert not missing, sorted(missing)


def test_generated_permission_code_files_are_current():
    assert _load_script().main(["--check"]) == 0
