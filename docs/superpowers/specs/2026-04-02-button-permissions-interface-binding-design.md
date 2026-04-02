# Button Permissions & Menu Interface Binding Design

Date: 2026-04-02

## Overview

Three related features to complete the RBAC permission system:

1. **Button-level permissions** — define standard button permission codes for all CRUD management pages, initialize them in `initdb.py`, and enforce them in frontend views via `hasAuth()`
2. **Menu interface binding** — add an `interfaces` field to the Menu model so each menu can associate with backend API routes from `manage_routers`
3. **Role interface permission panel redesign** — change the interface permission assignment UI from a flat list to a menu-tree grouped view, where each menu node shows its bound interfaces as checkable leaves

## 1. Button Permission Codes

### 1.1 Naming Convention

Format: `{route_name}:{action}`

| Menu (route_name) | Code | Description |
|---|---|---|
| manage_user | `manage_user:add` | 新增用户 |
| manage_user | `manage_user:edit` | 编辑用户 |
| manage_user | `manage_user:delete` | 删除用户 |
| manage_role | `manage_role:add` | 新增角色 |
| manage_role | `manage_role:edit` | 编辑角色 |
| manage_role | `manage_role:delete` | 删除角色 |
| manage_role | `manage_role:menuAuth` | 菜单权限 |
| manage_role | `manage_role:buttonAuth` | 按钮权限 |
| manage_role | `manage_role:interfaceAuth` | 接口权限 |
| manage_menu | `manage_menu:add` | 新增菜单 |
| manage_menu | `manage_menu:edit` | 编辑菜单 |
| manage_menu | `manage_menu:delete` | 删除菜单 |

### 1.2 initdb Changes

In `create_menus()`, populate the `buttons` field on each management menu:

```python
manage_user = Menu(
    ...
    buttons=[
        {"code": "manage_user:add", "desc": "新增用户"},
        {"code": "manage_user:edit", "desc": "编辑用户"},
        {"code": "manage_user:delete", "desc": "删除用户"},
    ],
)
```

Same pattern for `manage_role` (6 buttons) and `manage_menu` (3 buttons).

The ADMIN role's `button_permissions` should include all 12 button codes.

### 1.3 Frontend Enforcement

Each management page imports `useAuth()` from `@/hooks/business/auth` and uses `hasAuth(code)` to conditionally render action buttons.

**User management (`manage/user/index.vue`):**
- `TableHeaderOperation` add button: show only if `hasAuth('manage_user:add')`
- `TableHeaderOperation` batch delete button: show only if `hasAuth('manage_user:delete')`
- Row edit button: show only if `hasAuth('manage_user:edit')`
- Row delete button: show only if `hasAuth('manage_user:delete')`

**Role management (`manage/role/index.vue`):**
- Add/batch delete header buttons: `manage_role:add` / `manage_role:delete`
- Row edit/delete: `manage_role:edit` / `manage_role:delete`
- Menu auth button (in role-operate-drawer): `manage_role:menuAuth`
- Button auth button: `manage_role:buttonAuth`
- Interface auth button: `manage_role:interfaceAuth`

**Menu management (`manage/menu/index.vue`):**
- Add/batch delete header buttons: `manage_menu:add` / `manage_menu:delete`
- Row add child/edit: `manage_menu:add` / `manage_menu:edit`
- Row delete: `manage_menu:delete`

**Implementation approach:** The `TableHeaderOperation` component accepts `prefix`/`default`/`suffix` slots plus `@add` and `@delete` emits. Rather than modifying the shared component, wrap the add/delete buttons with `v-if="hasAuth(...)"` at the page level by using the `default` slot to override the built-in add/batch-delete buttons. For row-level buttons already rendered in JSX column definitions, wrap with conditional `hasAuth()` checks.

## 2. Menu Interface Binding

### 2.1 Backend — Menu Model Change

Add a new JSON column to the `Menu` model (`manage_menus` table):

```python
interfaces: list[str] = Field(default=[], sa_column=Column(JSON), description="绑定的接口权限码")
```

This stores a list of interface permission code strings (e.g., `["GET:/api/v1/users", "POST:/api/v1/users"]`), matching the `code` computed field from `FastAPIRouterResponse`.

### 2.2 Backend — Schema Change

Add `interfaces` to `MenuSchema` in `menu/schemas.py`:

```python
interfaces: list[str] = Field([], description="绑定的接口权限码列表")
```

No new API endpoints needed — the existing menu CRUD endpoints handle it automatically via the schema.

### 2.3 Frontend — Menu Type Update

Add `interfaces` to the `Menu` type in `system-manage.d.ts`:

```typescript
interfaces?: string[] | null
```

### 2.4 Frontend — Menu Edit Modal

In `menu-operate-modal.vue`, add a new form section after the buttons section (similar pattern to `query` and `buttons`):

- Add `interfaces: string[]` to the Model type and default model
- Add an `NSelect` (multiple mode, filterable) that loads options from `fetchGetBackendRouters()` (the existing `GET /router/backend` API)
- Each option's label shows the route name + methods + path (e.g., `[GET] /api/v1/users — 获取用户列表`), value is the permission code string
- The select allows searching/filtering routes

### 2.5 initdb — Interface Binding Data

Pre-populate `interfaces` for management menus:

| Menu | Bound Interfaces |
|---|---|
| manage_user | `GET:/api/v1/users`, `POST:/api/v1/users`, `PUT:/api/v1/users/{user_id}`, `DELETE:/api/v1/users/{user_id}`, `DELETE:/api/v1/users`, `GET:/api/v1/users/{user_id}` |
| manage_role | `GET:/api/v1/roles`, `POST:/api/v1/roles`, `PUT:/api/v1/roles/{role_id}`, `DELETE:/api/v1/roles/{role_id}`, `DELETE:/api/v1/roles`, `GET:/api/v1/roles/all`, `GET:/api/v1/roles/{role_id}/permissions`, `PUT:/api/v1/roles/{role_id}/permissions/router`, `PUT:/api/v1/roles/{role_id}/permissions/button`, `PUT:/api/v1/roles/{role_id}/permissions/interface` |
| manage_menu | `GET:/api/v1/manage/menus`, `POST:/api/v1/manage/menus`, `PUT:/api/v1/manage/menus/{menu_id}`, `DELETE:/api/v1/manage/menus/{menu_id}`, `DELETE:/api/v1/manage/menus`, `GET:/api/v1/manage/menus/tree`, `GET:/api/v1/manage/menus/pages` |

Note: Exact paths depend on the running FastAPI app. The initdb script can hardcode these since the paths are stable.

### 2.6 Frontend — API Service

Add a new function to fetch backend routers (if not already present):

```typescript
export function fetchGetBackendRouters() {
  return request<Api.SystemManage.BackendRouter[]>({ url: "/router/backend" })
}
```

Add the `BackendRouter` type to `system-manage.d.ts`:

```typescript
type BackendRouter = {
  id: string
  name: string
  description: string | null
  path: string
  methods: string[]
  code: string
}
```

## 3. Role Interface Permission Panel Redesign

### 3.1 Current State

The interface permission assignment currently doesn't have a dedicated modal (it was part of the plan but not fully built). We need to create/update `interface-auth-modal.vue` in `manage/role/modules/`.

### 3.2 New Design — Menu-Tree Grouped View

The modal displays an `NTree` where:

- **Top-level nodes** = menus that have `interfaces` bound (fetched from `GET /manage/menus/tree`)
- **Leaf nodes** = the interface permission codes bound to that menu
- Checkable with cascade: checking a menu checks all its interfaces
- `v-model:checked-keys` stores the selected interface permission code strings
- On submit, saves to `PUT /roles/{role_id}/permissions/interface`

### 3.3 Data Flow

1. Fetch menu tree via `fetchGetMenuTree()` — now includes `interfaces` field
2. Transform the tree: for each menu with non-empty `interfaces`, create child nodes from the interface codes
3. Fetch backend routers via `fetchGetBackendRouters()` to get human-readable names for each code
4. Build a lookup map: `code → { name, methods, path }`
5. Construct NTree data:
   ```
   Menu Name (菜单名)
   ├── [GET] /api/v1/users — 获取用户列表
   ├── [POST] /api/v1/users — 创建用户
   └── [DELETE] /api/v1/users/{user_id} — 删除用户
   ```
6. Load existing role permissions via `fetchGetRolePermissions(roleId)`
7. On save, send checked leaf codes (interface codes only, not menu keys) to `fetchUpdateInterfacePermissions()`

### 3.4 MenuTree Type Update

The `MenuTree` type in `system-manage.d.ts` needs to include `interfaces`:

```typescript
type MenuTree = {
  id: string
  menuName: string
  routeName: string
  children?: MenuTree[] | null
  buttons?: MenuButton[] | null
  interfaces?: string[] | null
}
```

### 3.5 i18n

Add to both locale files under `page.manage.role`:

| Key | EN-US | ZH-CN |
|---|---|---|
| `interfaceAuth` | Interface Auth | 接口权限 |

Add to both locale files under `page.manage.menu`:

| Key | EN-US | ZH-CN |
|---|---|---|
| `interface` | Interface | 接口 |
| `form.interface` | Please select bound interfaces | 请选择绑定的接口 |

## 4. Files to Modify

### Backend
- `apps/backend/src/domains/menu/models.py` — add `interfaces` field
- `apps/backend/src/domains/menu/schemas.py` — add `interfaces` to `MenuSchema`
- `apps/backend/src/initdb.py` — add buttons + interfaces to menus, button_permissions to ADMIN role

### Frontend
- `apps/frontend/src/typings/api/system-manage.d.ts` — add `interfaces` to Menu/MenuTree, add BackendRouter type
- `apps/frontend/src/service/api/system-manage.ts` — add `fetchGetBackendRouters()`
- `apps/frontend/src/views/manage/user/index.vue` — hasAuth checks on buttons
- `apps/frontend/src/views/manage/role/index.vue` — hasAuth checks on buttons
- `apps/frontend/src/views/manage/role/modules/role-operate-drawer.vue` — hasAuth checks on auth buttons
- `apps/frontend/src/views/manage/role/modules/interface-auth-modal.vue` — new/redesigned modal
- `apps/frontend/src/views/manage/menu/index.vue` — hasAuth checks on buttons
- `apps/frontend/src/views/manage/menu/modules/menu-operate-modal.vue` — add interfaces select
- `apps/frontend/src/locales/langs/en-US/page.json` — new i18n keys
- `apps/frontend/src/locales/langs/zh-CN/page.json` — new i18n keys
