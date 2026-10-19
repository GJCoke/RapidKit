---
name: rapidkit-shared-pkg
description: Create and manage shared packages in the RapidKit monorepo. Use this skill when the user asks to create a new shared package, add utilities to existing packages, or modify packages under the packages/ directory. Trigger whenever the user mentions shared packages, @rapidkit/* packages, rapidkit-core, rapidkit-common, or creating a reusable library.
---

# RapidKit Shared Packages

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

## Prerequisites

Read `rapidkit-conventions` skill first for universal project rules.

## Scope

This skill covers:

- TypeScript package creation and structure (`@rapidkit/*`)
- Python package creation and structure (`rapidkit-*`)
- Workspace registration (pnpm + uv)
- Build system and exports configuration

Out of scope (use other skills):

- Backend plugin code -> use `rapidkit-backend-design` or `rapidkit-plugin`
- Frontend app code -> use `rapidkit-frontend-design`
- CLI commands -> use `rapidkit-cli-design`

## Existing Packages

### TypeScript Packages (under `@rapidkit/` scope)

| Package             | Purpose                                      | Build type        |
| ------------------- | -------------------------------------------- | ----------------- |
| `@rapidkit/utils`   | Crypto, storage, nanoid, klona utilities     | ts (esm/cjs/iife) |
| `@rapidkit/axios`   | Axios HTTP client wrapper with retry         | ts (esm/cjs/iife) |
| `@rapidkit/alova`   | Alova HTTP client wrapper                    | ts (esm/cjs/iife) |
| `@rapidkit/color`   | Color palette generation                     | ts (esm/cjs/iife) |
| `@rapidkit/hooks`   | Vue composables (useTable, useBoolean, etc.) | vue (esm)         |
| `@rapidkit/editor`  | Monaco Editor Vue component                  | vue (esm)         |
| `@rapidkit/cli`     | Dev workflow CLI (private)                   | not published     |
| `@rapidkit/builder` | Internal Rollup build tooling                | not built         |

### Python Packages

| Package           | PyPI name         | Purpose                                                            |
| ----------------- | ----------------- | ------------------------------------------------------------------ |
| `packages/core`   | `rapidkit-core`   | Infrastructure: config, database, Redis, logging and timezone |
| `packages/common` | `rapidkit-common` | Models, CRUD, schemas, deps, auth, data scoping                    |
| `packages/framework` | `rapidkit-framework` | Plugin/HTTP runtime, events, services, identity and scope definitions |
| `packages/security` | `rapidkit-security` | Stateless JWT, password hashing and RSA utilities |

### Dependency Graph

```
@rapidkit/utils  (leaf)
  <- @rapidkit/axios
  <- @rapidkit/color
  <- @rapidkit/alova
  <- @rapidkit/hooks (also depends on @rapidkit/axios)

rapidkit-core
  <- rapidkit-framework
    <- rapidkit-common (also depends directly on core)
      <- apps/backend + business plugins

rapidkit-security (independent security utilities; imported by consumers as needed)
```

## TypeScript Package Convention

### Directory Layout

```
packages/<name>/
  package.json          # @rapidkit/<name>
  tsconfig.json         # extends ../../tsconfig.json
  src/
    index.ts            # barrel re-exports
    ...modules
```

### package.json Template

```json
{
  "name": "@rapidkit/<name>",
  "version": "0.1.0",
  "type": "module",
  "module": "./dist/index.esm.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "dev": "tsx ../builder/cli.ts --dev",
    "build": "tsx ../builder/cli.ts"
  },
  "buildOptions": {
    "type": "ts",
    "formats": ["esm", "cjs", "iife"],
    "name": "RapidKit<Name>"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Key `buildOptions` fields:

- `type`: `"ts"` for pure TypeScript, `"vue"` for packages with Vue SFCs
- `formats`: array of `"esm"`, `"cjs"`, `"iife"`
- `name`: global name for IIFE builds

For Vue packages, use `"type": "vue"` and `"formats": ["esm"]`.

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json"
}
```

### Workspace References

Other packages/apps reference via `"workspace:*"`:

```json
{
  "dependencies": {
    "@rapidkit/<name>": "workspace:*"
  }
}
```

## Python Package Convention

### Directory Layout

```
packages/<name>/
  pyproject.toml        # hatchling build, rapidkit-<name>
  package.json          # thin wrapper for pnpm/turbo orchestration
  src/
    rapidkit_<name>/    # Python package (underscores)
      __init__.py
      ...modules
```

### pyproject.toml Template

```toml
[project]
name = "rapidkit-<name>"
version = "0.1.0"
description = "<Package description>"
requires-python = ">=3.14"
dependencies = []

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/rapidkit_<name>"]
```

### package.json (for turbo integration)

```json
{
  "name": "rapidkit-<name>",
  "private": true,
  "scripts": {
    "postinstall": "uv sync",
    "format": "uv run ruff format src/",
    "typecheck": "uv run ty check src/"
  }
}
```

## Step-by-Step Operations

### Operation 1: Create a New TypeScript Package

1. Create `packages/<name>/` with:
   - `packages/<name>/package.json` from the template above
   - `packages/<name>/tsconfig.json` extending root
   - `src/index.ts` as the barrel entry point

2. The package is auto-discovered by pnpm (`packages/*` glob in `pnpm-workspace.yaml`) and Turborepo.

3. Add as dependency where needed:

   ```json
   "@rapidkit/<name>": "workspace:*"
   ```

4. Build:
   ```bash
   pnpm --filter @rapidkit/<name> build
   ```

### Operation 2: Create a New Python Package

1. Create `packages/<name>/` with:
   - `packages/<name>/pyproject.toml` from the template above
   - `packages/<name>/package.json` for turbo integration
   - `src/rapidkit_<name>/__init__.py`

2. Register in root `pyproject.toml` under `[tool.uv.workspace].members`:

   ```toml
   [tool.uv.workspace]
   members = [
       # ... existing ...
       "packages/<name>",
   ]
   ```

3. Add as dependency to consumers in their `pyproject.toml`:

   ```toml
   [project]
   dependencies = ["rapidkit-<name>"]

   [tool.uv.sources]
   rapidkit-<name> = { workspace = true }
   ```

4. Install:
   ```bash
   uv sync
   ```

## Rules

- ALWAYS use `@rapidkit/<name>` naming for TypeScript packages
- ALWAYS use `rapidkit-<name>` (hyphen) for Python PyPI names and `rapidkit_<name>` (underscore) for Python package directories
- ALWAYS use `"workspace:*"` for TS package references and `{ workspace = true }` for Python package references
- ALWAYS use the shared builder (`tsx ../builder/cli.ts`) for TS package builds -- never configure Rollup/Vite directly
- ALWAYS export through a barrel `src/index.ts` for TS packages
- NEVER add Python packages to `pnpm-workspace.yaml` `members` -- they are registered in root `pyproject.toml`'s `[tool.uv.workspace]`
- PREFER keeping packages focused on a single responsibility -- create separate packages rather than expanding existing ones with unrelated functionality
