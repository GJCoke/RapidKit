---
name: rapidkit-permission
description: Declare and wire permissions for the RapidKit project — resources, permission codes (`资源:动作`), built-in permission packages, route access declarations (Require / Authenticated / Public), data scopes and field groups, plus the generated frontend PermissionCode types and button-level checks (hasAuth / Can). Use this skill whenever the user adds or changes a backend endpoint, adds a plugin that exposes APIs, creates a new resource or model that roles should control, asks to "加权限 / 权限码 / 功能包 / 数据范围 / 字段脱敏 / 按钮权限", hits a startup error like "Route has no access declaration" or "Unknown permission code", or touches `permissions.py`, `rapidkit_common.access`, `rapidkit_framework.scopes`, or `permission-codes.d.ts` — even if they don't say "permission" explicitly.
---

# RapidKit Permission

## Prerequisites

Read `rapidkit-conventions` skill first for universal project rules (file headers, import style, naming).

## Scope

This skill covers:

- Plugin permission declarations (`permissions.py`: resources, codes, packages) and manifest wiring
- Route access declarations (`Require` / `Authenticated` / `Public`) and the `Scope` object
- Declarative data scopes (row filtering) and field groups (masked / hidden fields)
- `unscoped()` escape hatch and the rules that keep scope enforcement sound
- Access declaration tests and the route-access CI contract
- Generated frontend permission-code types and button-level checks in `apps/frontend` and `apps/admin`

Out of scope (use other skills):

- Writing models, CRUD, schemas, endpoint bodies -> use `rapidkit-backend-design`
- Plugin skeleton / registration -> use `rapidkit-plugin`
- Database migrations (e.g. menu seed changes) -> use `rapidkit-migration`
- Vue pages/components in `apps/frontend` -> use `rapidkit-frontend-design`.
- React UI in `apps/admin` -> use the existing React patterns and `shadcn` for shadcn components; the Vue-only `rapidkit-frontend-design` does not apply.

The old policy engine (`packages/policy-engine`, data/field policy tables, `PermissionDef`) has been removed. If you see code or docs referencing them, they are stale — do not reintroduce them.

## Mental Model

```
Plugin declares (code)              Admin configures (runtime)          Request enforces
──────────────────────              ──────────────────────────          ────────────────
ResourceDef  ─┬─ data_scopes    →   Role: one scope per resource    →   Require(code) binds row filter
              └─ field_groups   →   Role: visible/masked/hidden     →   to the request session +
PermissionCodeDef (res:action)  →   Role: granted codes             →   field rules to serialization
PermissionPackageDef            →   Apply package to role (merge/replace)
```

- **Resource** is the anchor: every permission code's prefix must be a declared resource key.
- **Permission code** gates an endpoint. `depends` codes are granted transitively (granting `user:create` also grants `user:read` and whatever it depends on), so the UI never ends up with a write permission whose list page is forbidden.
- **Package** is a named bundle of codes admins apply to roles in one click.
- **Data scope / field group** are options the developer *offers*; admins *choose* per role. Unconfigured = all rows, all fields visible. Multiple roles union scopes and take the most permissive field mode. Super admins (`is_admin`) bypass everything.

## Key Files

```
packages/framework/src/rapidkit_framework/
├── plugin.py      # ResourceDef, PermissionCodeDef, PermissionPackageDef, DashboardModuleDef, PluginManifest
└── scopes.py      # DataScopeDef, FieldGroupDef, ScopeContext, helpers: dept_subtree / dept / self_only / creator

packages/common/src/rapidkit_common/
├── access.py          # Require, Authenticated, Public, Scope, has_route_access, inspect_route_access
├── access_testing.py  # allow_access / deny_access / allow_current_user_access test overrides
└── scope_runtime.py   # unscoped(), apply_field_rules(), session listeners

apps/backend/plugins/<name>/src/plugin_<name>/permissions.py   # RESOURCES / PERMISSION_CODES / PERMISSION_PACKAGES
apps/backend/plugins/permission/src/plugin_permission/catalog/ # registry (validation), route_check (startup self-check)
apps/backend/tests/testing/access.py                           # declared_access() helper for tests
apps/backend/tests/route_access_public.txt                     # reviewed list of Public routes
apps/backend/scripts/export_permission_catalog.py              # generates frontend PermissionCode types
apps/website/src/architecture/data-scopes.md                   # authoritative data-scope constraints (Chinese)

apps/frontend/src/typings/permission-codes.d.ts   # GENERATED global `PermissionCode` union
apps/frontend/src/hooks/business/auth.ts          # useAuth().hasAuth(code | code[])
apps/admin/src/typings/permission-codes.ts        # GENERATED exported `PermissionCode`
apps/admin/src/features/auth/permissions.tsx      # <Can>, usePermission, hasPermission
```

## Core Patterns

### 1. `permissions.py` — Declarations Per Plugin

Every plugin that exposes protected APIs keeps its declarations in one `permissions.py`, separate from `__init__.py`, so tests and the catalog exporter can import them without loading the router.

```python
"""
订单插件的资源、权限码与内置功能包声明。

Author : Name
Date   : YYYY-MM-DD
"""

from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, ResourceDef
from rapidkit_framework.scopes import FieldGroupDef, creator, dept_subtree

from plugin_order.models import Order

RESOURCES = [
    ResourceDef(
        key="order",
        label="订单",
        model=Order,
        data_scopes=(
            dept_subtree(Order.department_id),
            creator(Order.created_by),
        ),
        field_groups=(
            FieldGroupDef("amount", "金额", fields=("total_amount", "discount")),
            FieldGroupDef("note", "内部备注", fields=("internal_note",), modes=("hidden",)),
        ),
    )
]

PERMISSION_CODES = [
    PermissionCodeDef(code="order:options", label="选择订单", abac_action="read"),
    PermissionCodeDef(code="order:read", label="查看订单", abac_action="read", depends=("order:options",)),
    PermissionCodeDef(code="order:create", label="新增订单", abac_action="write", depends=("order:read",)),
    PermissionCodeDef(code="order:update", label="编辑订单", abac_action="write", depends=("order:read",)),
    PermissionCodeDef(code="order:delete", label="删除订单", abac_action="write", depends=("order:read",)),
]

PERMISSION_PACKAGES = [
    PermissionPackageDef(key="order.readonly", label="订单 · 只读", codes=("order:read",)),
    PermissionPackageDef(
        key="order.full",
        label="订单 · 完整",
        codes=("order:read", "order:create", "order:update", "order:delete"),
    ),
]
```

Naming rules (validated at startup by `catalog/registry.py` — violations raise `CatalogError` and the app refuses to start):

| Item                | Pattern                                     | Examples                                    |
| ------------------- | ------------------------------------------- | ------------------------------------------- |
| Resource key        | `^[a-z][a-z0-9-]*$`                         | `user`, `notification-template`, `api-route` |
| Permission code     | `<resource>:<action>`, both kebab-case      | `user:reset-password`, `role:options`       |
| `abac_action`       | `"read"` or `"write"`                       | queries/exports = read, mutations = write   |
| Package key         | `<resource>.<variant>`, not `custom.*`      | `user.readonly`, `user.full`                |
| Scope / group key   | `^[a-z][a-z0-9_]*$`, `all` is reserved      | `dept_subtree`, `self`, `contact`           |

Conventional actions: `read`, `create`, `update`, `delete`, plus `options` for lightweight dropdown/select endpoints that other modules depend on (e.g. `user:read` depends on `role:options` and `department:read` because the user list renders role and department pickers). Add a dedicated code for a distinct capability (`user:reset-password`, `user:stats`, `notification:retry`) rather than overloading `update`.

Other catalog checks: no duplicate resources/codes, every `depends` target exists, no dependency cycles, and a resource with `data_scopes` or `field_groups` must have a `model`; scope columns must belong to that model and each field may belong to only one field group. A resource without a model (`ResourceDef(key="dashboard", label="仪表盘")`) is fine for codes that don't map to a table.

Permission packages exist only in server `PluginManifest.permission_packages` declarations. There is no package database model or user-facing package CRUD. The role editor reads `GET /permission-packages/all` and uses packages as bulk checkbox shortcuts; final grants are saved with `PUT /roles/{role_id}/permissions`. Both endpoints require `role:grant`. Runtime permission extensions are retired: codes, depends and route access must be declared in code.

### 2. Wire Into `register()`

```python
from plugin_order.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES


def register() -> PluginManifest:
    from plugin_order.api import router
    from plugin_order.models import Order

    return PluginManifest(
        name="order",
        version="0.1.0",
        router=router,
        models=[Order],
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
    )
```

The permissions import sits at module top (it only pulls in models); the router import stays inside `register()` as usual.

### 3. Route Access Declarations

**Every API route must carry exactly one access declaration.** The permission plugin self-checks all routes at startup: a route with none, or with more than one, is an error that stops the app; an unknown code is also an error. A declared code not bound to any route is only a warning.

| Declaration                    | Meaning                                              | When to use                                          |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `Require("res:action")`        | Must hold the code; binds data scope + field rules   | Default for any business endpoint                    |
| `Authenticated`                | Logged in, no code check, no scope                   | Self-service: own profile, own notifications, admin contacts |
| `Public`                       | No login                                             | Login, token refresh, invite/reset validation. Needs review + `route_access_public.txt` |

Two equivalent placements for `Require`:

```python
from typing import Annotated

from rapidkit_common.access import Authenticated, Public, Require, Scope


# 1) Decorator-level — endpoint does not need the user
@router.get("", dependencies=[Require("order:read")])
async def list_orders(crud: OrderCrudDep, query: OrderQueryDep) -> Response[PaginatedResponse[OrderResponse]]:
    ...


# 2) Parameter-level — endpoint needs scope.user (operator id, is_admin checks, audit logs)
@router.put("/{order_id}")
async def update_order(
    order_id: UUID,
    body: OrderUpdate,
    scope: Annotated[Scope, Require("order:update")],
    crud: OrderCrudDep,
) -> Response[OrderResponse]:
    current_user = scope.user
    ...


@router.get("/mine", dependencies=[Authenticated])
async def my_orders(user: UserDBDep) -> ...: ...
```

Use one form per route — mixing `dependencies=[Require(...)]` with a `Scope` parameter counts as two declarations. If the endpoint also needs `CurrentUserDep`/`UserDBDep` for other reasons, that is fine; those are not access declarations.

Sensitive operations that an impersonating admin must not perform (password changes, etc.) add `Depends(DenyImpersonation)` alongside the access declaration:

```python
@router.put("/{user_id}/password", dependencies=[Depends(DenyImpersonation)])
async def change_password(user_id: UUID, scope: Annotated[Scope, Require("user:reset-password")], ...): ...
```

For a second, in-body authorization check against another route (rare), use `has_route_access(request, "METHOD:/api/v1/...")` after handling `user.is_admin` yourself.

### 4. Data Scopes

`Require(code)` binds the resource's row condition to the **request session**. Queries, counts, joins and ORM deletes on that model are filtered automatically — endpoint code does not add `WHERE` clauses for scope. Writes are re-checked at flush: a created/updated row that falls outside the scope is rejected.

Built-in helpers (`rapidkit_framework.scopes`):

| Helper                     | Default key / label          | Condition                                       |
| -------------------------- | ---------------------------- | ----------------------------------------------- |
| `dept_subtree(column)`     | `dept_subtree` / 本部门及以下 | column in user's department subtree             |
| `dept(column)`             | `dept` / 本部门               | column == user's department                     |
| `self_only(column)`        | `self` / 仅本人               | column == user id                               |
| `creator(column)`          | `creator` / 本人创建          | column (usually `created_by`) == user id        |

All accept `key=` / `label=` overrides. Users without a department see nothing under department scopes. For custom logic, build a `DataScopeDef` directly and list **every column the condition reads** in `columns` (used for validation and for blocking bulk updates to those columns); set `needs_dept_subtree=True` if `build` reads `ctx.dept_subtree_ids`:

```python
def _dept_subtree(ctx: ScopeContext) -> ColumnElement[bool]:
    """本部门及以下：部门自身或其父部门在子树内，允许在子树内新建子部门。"""
    if not ctx.dept_subtree_ids:
        return false()
    return or_(col(Department.id).in_(ctx.dept_subtree_ids), col(Department.parent_id).in_(ctx.dept_subtree_ids))


DataScopeDef(
    key="dept_subtree",
    label="本部门及以下",
    build=_dept_subtree,
    columns=(Department.id, Department.parent_id),
    needs_dept_subtree=True,
)
```

Return `false()` (not `None`, not raising) when the user lacks the context the scope needs.

### 5. Field Groups

`FieldGroupDef(key, label, fields=(...), modes=("masked", "hidden"))` — fields are model column names; `modes` limits which restricted states admins may pick (`visible` is always allowed). Use `modes=("hidden",)` for free text where masking makes no sense.

Field rules apply when a `BaseResponse` / `BaseSchema` is built **from an ORM object** — including nested responses. Writes to restricted fields are rejected at flush. If you hand-build a dict instead of serializing the ORM object, pass it through `scope.serialize(data, Model)`, otherwise restricted fields leak.

### 6. Rules That Keep Scopes Sound

These come from `apps/website/src/architecture/data-scopes.md`; the runtime cannot enforce scope on paths it doesn't see, so these are what actually keep data from leaking:

- Read through the request session and `BaseCRUD` / `select()`. `Session.get()` can return an identity-map hit without re-filtering — use `crud.get()` instead.
- Create/update by loading ORM objects in the same request session, assigning, and flushing. Roll back on exceptions.
- Bulk ORM `UPDATE` (including `BaseCRUD.update_all`) must not touch scope-condition columns or restricted fields — the runtime rejects it. Load objects and assign instead.
- Never use raw SQL, Core `Table` updates, or a separately opened session for a scoped model inside a request.
- `unscoped(session)` disables row filtering only, for internal integrity checks that must see everything (e.g. "does this department still have children?"). It does **not** disable field-write protection. Every use is listed by `pnpm report:unscoped` for review, so keep it narrow and comment why:

```python
async def has_children(self, dept_id: UUID) -> bool:
    """检查部门是否存在子部门；子部门可能在数据范围外，因此不受范围过滤。"""
    stmt = select(Department.id).where(Department.parent_id == dept_id).limit(1)
    with unscoped(self.session):
        result = await self.session.exec(stmt)
        return result.first() is not None
```

- Celery tasks, startup scripts, event listeners using `AsyncSessionLocal()` are not bound to request rules — they see all data. Don't rely on scope there; pass already-authorized IDs in.

### 7. Menus

Page menus (`menu_type == "2"`, non-constant) carry `Menu.permission` — the code needed to enter the page, usually `<resource>:read`. Directories inherit from children. New built-in pages get a seed in `apps/backend/src/_menu_seeds.py` with `permission="order:read"`, plus a migration for existing databases (see `rapidkit-migration`).

### 8. Frontend Button Checks

After adding/removing codes, regenerate the types — never hand-edit the generated files:

```bash
pnpm gen:permission-codes      # writes permission-codes.d.ts (frontend) and permission-codes.ts (admin)
pnpm check:permission-codes    # CI: fails if generated files are stale
```

`apps/frontend` (Vue) — `PermissionCode` is a global ambient type:

```ts
const { hasAuth } = useAuth()
const canEdit = computed(() => hasAuth("order:update"))
const canExport = computed(() => hasAuth(["order:read", "order:export"])) // any-of
```

`apps/admin` (React):

```tsx
import { Can, usePermission } from "@/features/auth"

<Can permission="order:update">
  <Button onClick={onEdit}>编辑</Button>
</Can>

const canDelete = usePermission("order:delete")
```

Both treat `isAdmin` as all-allowed and an array as any-of. Frontend checks are UX only — the backend `Require` is the real gate. Use string literals so `pnpm report:permission-codes` can detect unused (dead) codes.

## Step-by-Step Operations

### Operation 1: Add Permissions to a New Plugin / Resource

1. Create `src/plugin_<name>/permissions.py` with `RESOURCES`, `PERMISSION_CODES`, `PERMISSION_PACKAGES` (Pattern 1). Decide `depends` by asking: "what other endpoints does the page for this action call?"
2. Wire them into `register()` (Pattern 2).
3. Declare access on every route in the plugin's router (Pattern 3).
4. If roles should restrict rows or fields, add `data_scopes` / `field_groups` and follow the rules in Pattern 6 in CRUD/services.
5. Add a menu seed with `permission=` for new pages (Pattern 7).
6. Write tests (Operation 4), run `pnpm gen:permission-codes`, then add `hasAuth` / `<Can>` on frontend buttons.

### Operation 2: Add an Endpoint to an Existing Plugin

1. Pick an existing code if the endpoint is part of the same capability (e.g. `resend-invite` reuses `user:create`). Otherwise add a new `PermissionCodeDef` with appropriate `depends`, and add it to the relevant `*.full` package.
2. Add exactly one access declaration. Use the `Scope` parameter form if the body needs `scope.user`.
3. Update the plugin's `test_access_declarations.py` expected map.
4. If a new code was added: `pnpm gen:permission-codes`.

### Operation 3: Add a Public Endpoint

Public endpoints skip authentication entirely, so they're reviewed: confirm with the user that it truly must be anonymous, use `dependencies=[Public]`, and add the route key (`METHOD:/api/v1/...`, sorted) to `apps/backend/tests/route_access_public.txt`. `test_route_access_contract.py` fails until the snapshot matches.

### Operation 4: Tests

Per-plugin `tests/test_access_declarations.py` pins every route's declaration and the manifest's codes:

```python
"""订单接口访问声明。"""

from plugin_order import register
from plugin_order.api import router
from tests.testing.access import declared_access


def test_order_routes_declare_expected_access():
    assert declared_access(router) == {
        "GET:/api/v1/orders": "require:order:read",
        "POST:/api/v1/orders": "require:order:create",
        "PUT:/api/v1/orders/{order_id}": "require:order:update",
        "DELETE:/api/v1/orders/{order_id}": "require:order:delete",
    }


def test_order_manifest_declares_codes():
    manifest = register()
    assert [r.key for r in manifest.resources] == ["order"]
    assert {c.code: c.depends for c in manifest.permission_codes} == {
        "order:options": (),
        "order:read": ("order:options",),
        "order:create": ("order:read",),
        "order:update": ("order:read",),
        "order:delete": ("order:read",),
    }
```

Labels: `require:<code>`, `authenticated`, `public`, `none`; multiple declarations joined with `|`; `+deny-impersonation` suffix when `DenyImpersonation` is present.

If the resource declares scopes/field groups, add `tests/test_scope_declarations.py` that runs them through `build_catalog` so invalid columns/fields fail in unit tests rather than at startup:

```python
from plugin_order.permissions import RESOURCES
from plugin_permission.catalog.registry import build_catalog
from rapidkit_framework.plugin import PluginManifest


def test_order_resource_declarations_are_valid():
    catalog = build_catalog([PluginManifest(name="order", version="0", resources=RESOURCES)], {})
    order = catalog.resources["order"]
    assert [s.key for s in order.data_scopes] == ["dept_subtree", "creator"]
```

For endpoint behavior tests that shouldn't depend on real role setup, override the access guard:

```python
from rapidkit_common.access import access_guard_dependency
from rapidkit_common.access_testing import allow_access, allow_current_user_access, deny_access

app.dependency_overrides[access_guard_dependency] = allow_access(user)      # every Require passes as `user`
app.dependency_overrides[access_guard_dependency] = deny_access()           # every Require -> 403
app.dependency_overrides[access_guard_dependency] = allow_current_user_access  # real auth, codes always pass
```

These overrides skip scope binding, so test data-scope behavior end-to-end with real roles (see `plugins/user/tests/test_scoped_api.py`).

### Operation 5: Verify

```bash
pnpm check:permission-codes   # generated types fresh
pnpm report:permission-codes  # dead codes (informational)
pnpm report:unscoped          # review every unscoped() use
uv run --directory apps/backend pytest tests/test_route_access_contract.py plugins/<name>/tests
```

## Rules

- ALWAYS give every route exactly one of `Require` / `Authenticated` / `Public` — the app won't start otherwise
- ALWAYS keep declarations in `permissions.py` and the code prefix equal to a declared resource key
- ALWAYS mark mutations `abac_action="write"` and make write codes `depends` on the matching `read` code
- NEVER hand-edit `permission-codes.d.ts` / `permission-codes.ts` — run `pnpm gen:permission-codes`
- NEVER add a `Public` route without user confirmation and a `route_access_public.txt` update
- NEVER bypass the request session for scoped models (raw SQL, new sessions, `Session.get()`); use `BaseCRUD`
- ALWAYS serialize from ORM objects, or call `scope.serialize(data, Model)` for hand-built dicts
- PREFER `Authenticated` only for endpoints that act on the caller's own data; anything touching other users' data needs a code
- KEEP `unscoped()` blocks minimal with a comment explaining why full visibility is required
- ADD `Depends(DenyImpersonation)` to credential- or identity-changing endpoints
