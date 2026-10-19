"""扩展判定 plan_extensions 测试。"""

from dataclasses import dataclass, field

from plugin_permission.catalog.extensions import CatalogExtension, plan_extensions


@dataclass
class _Code:
    depends: tuple[str, ...] = ()


@dataclass
class _Baseline:
    resources: dict = field(default_factory=lambda: {"user": object(), "department": object(), "position": object()})
    codes: dict = field(
        default_factory=lambda: {
            "user:read": _Code(),
            "user:update": _Code(depends=("user:read", "department:read")),
            "department:read": _Code(),
            "position:read": _Code(),
        }
    )
    route_bindings: dict = field(
        default_factory=lambda: {
            "GET:/api/v1/users": "user:read",
            "GET:/api/v1/departments/tree": "department:read",
            "GET:/api/v1/positions/all": "position:read",
        }
    )

    def expand(self, codes):
        result: set[str] = set()
        stack = [c for c in codes if c in self.codes]
        while stack:
            code = stack.pop()
            if code in result:
                continue
            result.add(code)
            stack.extend(d for d in self.codes[code].depends if d in self.codes)
        return result

    def codes_for_route(self, route_key):
        declared = self.route_bindings.get(route_key)
        return {declared} if declared else set()


def _plan(*extensions: CatalogExtension):
    baseline = _Baseline()
    return plan_extensions(baseline, baseline.route_bindings, list(extensions))


def _status(plan, index: int = -1) -> tuple[str, str | None]:
    state = plan.states[index]
    return state.status, state.reason


def test_custom_code_active_and_merged():
    plan = _plan(CatalogExtension(kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read"))
    assert _status(plan) == ("active", None)
    assert [e.code for e in plan.custom_codes] == ["user:audit"]


def test_custom_code_already_in_baseline_is_cleanable():
    plan = _plan(CatalogExtension(kind="custom_code", code="user:read", resource="user", label="x", abac_action="read"))
    assert _status(plan) == ("cleanable", "covered_by_baseline")
    assert plan.custom_codes == ()


def test_custom_code_validation_failures():
    assert _status(_plan(CatalogExtension(kind="custom_code", code="User:X", resource="user", abac_action="read"))) == (
        "invalid",
        "invalid_format",
    )
    assert _status(_plan(CatalogExtension(kind="custom_code", code="role:x", resource="role", abac_action="read"))) == (
        "invalid",
        "unknown_resource",
    )
    assert _status(_plan(CatalogExtension(kind="custom_code", code="user:x", resource="position", abac_action="read"))) == (
        "invalid",
        "resource_mismatch",
    )
    assert _status(_plan(CatalogExtension(kind="custom_code", code="user:x", resource="user", abac_action="admin"))) == (
        "invalid",
        "invalid_action",
    )


def test_duplicate_custom_code_is_redundant():
    ext = CatalogExtension(kind="custom_code", code="user:audit", resource="user", abac_action="read")
    plan = _plan(ext, ext)
    assert _status(plan, 0) == ("active", None)
    assert _status(plan, 1) == ("cleanable", "redundant")


def test_depends_active_and_unknown():
    plan = _plan(CatalogExtension(kind="depends", code="user:update", depends_on="position:read"))
    assert _status(plan) == ("active", None)
    assert plan.depends == {"user:update": ("position:read",)}
    assert _status(_plan(CatalogExtension(kind="depends", code="user:update", depends_on="ghost:read"))) == (
        "invalid",
        "unknown_code",
    )


def test_depends_on_custom_code_defined_earlier():
    plan = _plan(
        CatalogExtension(kind="custom_code", code="user:audit", resource="user", abac_action="read"),
        CatalogExtension(kind="depends", code="user:audit", depends_on="user:read"),
    )
    assert _status(plan) == ("active", None)


def test_depends_covered_by_baseline_transitively():
    plan = _plan(CatalogExtension(kind="depends", code="user:update", depends_on="department:read"))
    assert _status(plan) == ("cleanable", "covered_by_baseline")


def test_depends_redundant_via_other_extension():
    plan = _plan(
        CatalogExtension(kind="depends", code="user:read", depends_on="position:read"),
        CatalogExtension(kind="depends", code="user:update", depends_on="position:read"),
    )
    assert _status(plan) == ("cleanable", "redundant")


def test_depends_cycle_rejected():
    assert _status(_plan(CatalogExtension(kind="depends", code="user:read", depends_on="user:read"))) == ("invalid", "cycle")
    assert _status(_plan(CatalogExtension(kind="depends", code="department:read", depends_on="user:update"))) == (
        "invalid",
        "cycle",
    )


def test_route_binding_active():
    plan = _plan(CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/positions/all"))
    assert _status(plan) == ("active", None)
    assert plan.route_codes == {"GET:/api/v1/positions/all": frozenset({"user:read"})}


def test_route_binding_unknown_route_or_code():
    assert _status(_plan(CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/nope"))) == (
        "invalid",
        "unknown_route",
    )
    assert _status(
        _plan(CatalogExtension(kind="route_binding", code="ghost:read", route_key="GET:/api/v1/positions/all"))
    ) == ("invalid", "unknown_code")


def test_route_binding_covered_by_baseline_expansion():
    plan = _plan(CatalogExtension(kind="route_binding", code="user:update", route_key="GET:/api/v1/departments/tree"))
    assert _status(plan) == ("cleanable", "covered_by_baseline")


def test_route_binding_redundant_after_depends_extension():
    plan = _plan(
        CatalogExtension(kind="depends", code="user:read", depends_on="position:read"),
        CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/positions/all"),
    )
    assert _status(plan) == ("cleanable", "redundant")


def test_invalid_and_cleanable_are_excluded_from_plan():
    plan = _plan(
        CatalogExtension(kind="route_binding", code="ghost:read", route_key="GET:/api/v1/positions/all"),
        CatalogExtension(kind="depends", code="user:update", depends_on="department:read"),
    )
    assert plan.route_codes == {}
    assert plan.depends == {}
    assert len(plan.states) == 2
