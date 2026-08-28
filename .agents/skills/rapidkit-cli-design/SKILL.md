---
name: rapidkit-cli-design
description: Create production-grade CLI code for the RapidKit project. Use this skill when the user asks to build CLI commands, add subcommands, create services, or modify any TypeScript code within the `packages/cli/` directory. Generates code that follows the four-layer architecture and project conventions.
license: Complete terms in LICENSE.txt
---

This skill guides creation of production-grade CLI code for the **RapidKit** project.
All generated code MUST follow the four-layer architecture, conventions, and patterns described below.

## Project Architecture

RapidKit CLI is built on **citty** (command framework) + **@clack/prompts** (terminal UI) + **Zod** (schema validation) + **Vitest** (testing).

```
packages/cli/
├── package.json
├── vitest.config.ts
└── src/
    ├── index.ts                # Entry point, top-level command routing
    ├── constants.ts            # Path constants (BACKEND_DIR, DEV_COMPOSE, etc.)
    ├── context.ts              # FluxContext — validated runtime context
    ├── errors.ts               # Error types
    │
    ├── infra/                  # Layer 1: Infrastructure — generic capabilities
    │   ├── runner.ts           # TaskRunner, hasCommand, execCommand, createTaskRunner
    │   ├── renderer.ts         # Terminal rendering with ANSI colors, spinner
    │   ├── compose.ts          # Docker/Podman Compose command builders
    │   ├── config.ts           # .rapidkit.local.json read/write + RapidKitConfigSchema
    │   ├── env.ts              # .env file parsing + DbCredentialsSchema
    │   └── i18n/               # Internationalization (index.ts, zh-CN.ts, en-US.ts)
    │
    ├── services/               # Layer 2: Domain services — business logic, NO UI
    │   ├── alembic.service.ts  # Alembic arg building + execution + output parsing
    │   ├── plugin.service.ts   # Plugin discovery + alembic config sync
    │   ├── database.service.ts # DB operations: schema drop/create, upgrade, seed
    │   └── migration.service.ts# Change detection + migration generation
    │
    ├── commands/               # Layer 3: Commands — UI interaction + orchestration
    │   ├── _shared.ts          # defineFluxCommand, createComposeCommand, createComposeLogsCommand
    │   ├── clean.ts
    │   ├── config.ts
    │   ├── create-plugin.ts
    │   ├── dev/                # Dev environment commands (up, down, logs, db/)
    │   ├── prod/               # Production commands (up, down, build, logs)
    │   └── db/                 # Database commands (migrate, upgrade, downgrade, status, reset, seed)
    │
    └── __tests__/              # Vitest tests
        ├── infra/              # Tests for infra modules
        └── services/           # Tests for service modules
```

### Layer Dependency Rules

```
commands/  ──→  services/  ──→  infra/
    │               │              │
    │               │              └─→ node builtins, zod
    │               └─→ infra/, ../constants, ../context
    └─→ services/, infra/, @clack/prompts, citty
```

- `infra/` → depends on nothing (node builtins + zod only)
- `services/` → depends on `infra/`, `../constants`, `../context`. **MUST NOT import `@clack/prompts`**
- `commands/` → depends on `services/` and `infra/`. **Only layer allowed to use `@clack/prompts`**

## Core Patterns

### Import Paths

```typescript
// Infrastructure
import { createTaskRunner, hasCommand, execCommand, type TaskRunner } from "../infra/runner"
import { buildComposeCommand, spawnComposeLogs } from "../infra/compose"
import { t, type MessageKey } from "../infra/i18n"
import { readDbCredentials, type DbCredentials } from "../infra/env"
import { loadConfig, type RapidKitConfig } from "../infra/config"

// Services
import { buildMigrateArgs, buildUpgradeArgs, parseHeads } from "../services/alembic.service"
import { discoverPlugins, findPlugin, syncAlembicConfig } from "../services/plugin.service"
import * as databaseService from "../services/database.service"
import * as migrationService from "../services/migration.service"

// Context
import { getContext, type FluxContext } from "../context"

// Command factories
import { defineFluxCommand, createComposeCommand, createComposeLogsCommand } from "./_shared"
```

### Zod Schema Pattern

Only validate at system boundaries (config files, env files, CLI args). Do not re-validate internal data.

```typescript
import { z } from "zod"

// Define schema
export const MyConfigSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
})

// Infer type from schema
export type MyConfig = z.infer<typeof MyConfigSchema>

// Use in parsing
export function loadMyConfig(raw: unknown): MyConfig {
  return MyConfigSchema.parse(raw)
}
```

**Existing schemas:**

| Schema                 | Location          | Purpose                                       |
| ---------------------- | ----------------- | --------------------------------------------- |
| `FluxContextSchema`    | `context.ts`      | Runtime context: runtime, region, locale, cwd |
| `RapidKitConfigSchema` | `infra/config.ts` | Config file: runtime?, region?, locale?       |
| `DbCredentialsSchema`  | `infra/env.ts`    | DB credentials: user, database, password      |

### Service Pattern

Services are **exported functions** (not classes). They accept dependencies as parameters — typically `TaskRunner` and/or other service outputs.

```typescript
// services/example.service.ts
import { type TaskRunner } from "../infra/runner"
import { t } from "../infra/i18n"
import { getContext } from "../context"

export interface ExampleResult {
  items: string[]
  hasChanges: boolean
}

/**
 * Pure domain logic. Returns data only — no UI prompts, no console output.
 */
export function detectSomething(runner: TaskRunner): ExampleResult {
  const ctx = getContext()
  // ... business logic ...
  return { items: [], hasChanges: false }
}

export async function executeSomething(runner: TaskRunner, items: string[]): Promise<void> {
  await runner.run({ label: t("example.executing") }, "uv", ["run", "some-command", ...items])
}
```

### Command Pattern — `defineFluxCommand`

Eliminates the `getContext()` → `createTaskRunner()` → `run()` → `done()` boilerplate.

```typescript
// commands/example.ts
import { confirm, isCancel, log } from "@clack/prompts"
import { t } from "../infra/i18n"
import * as exampleService from "../services/example.service"
import { defineFluxCommand } from "./_shared"

export const example = defineFluxCommand({
  meta: { description: t("example.title") },
  async run({ ctx, runner }) {
    // 1. Call service for data
    const result = exampleService.detectSomething(runner)

    // 2. UI interaction — ONLY in command layer
    if (result.hasChanges) {
      const shouldProceed = await confirm({ message: t("example.confirm") })
      if (isCancel(shouldProceed) || !shouldProceed) return
    }

    // 3. Call service for execution
    await exampleService.executeSomething(runner, result.items)

    log.success(t("example.done"))
  },
})
```

### Symmetric Dev/Prod Commands — `createComposeCommand`

For commands that differ only in compose file path:

```typescript
// commands/dev/down.ts
import { DEV_COMPOSE } from "../../constants"
import { createComposeCommand } from "../_shared"

export const down = createComposeCommand({
  composePath: DEV_COMPOSE,
  action: "down",
  labelKey: "dev.down.starting",
})
```

```typescript
// commands/prod/down.ts
import { PROD_COMPOSE } from "../../constants"
import { createComposeCommand } from "../_shared"

export const down = createComposeCommand({
  composePath: PROD_COMPOSE,
  action: "down",
  labelKey: "prod.down.starting",
})
```

For log-following commands:

```typescript
// commands/dev/logs.ts
import { DEV_COMPOSE } from "../../constants"
import { createComposeLogsCommand } from "../_shared"

export const logs = createComposeLogsCommand({
  composePath: DEV_COMPOSE,
  labelKey: "dev.logs.title",
})
```

### Command with Args

```typescript
import { defineFluxCommand } from "./_shared"
import { t } from "../../infra/i18n"

export const myCommand = defineFluxCommand({
  meta: { description: t("my.command.title") },
  args: {
    name: { type: "positional", description: "Plugin name", required: true },
    force: { type: "boolean", description: "Skip confirmation", default: false },
  },
  async run({ ctx, runner, args }) {
    const pluginName = args.name as string
    const force = args.force as boolean
    // ...
  },
})
```

### i18n Pattern

All user-facing strings go through `t()`. Both locale files must be updated together.

```typescript
// infra/i18n/zh-CN.ts — add key
"example.title": "示例命令",
"example.confirm": "确认执行？",
"example.done": "完成",

// infra/i18n/en-US.ts — add key
"example.title": "Example command",
"example.confirm": "Confirm execution?",
"example.done": "Done",
```

### Testing Pattern

```typescript
// __tests__/services/example.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock external dependencies
vi.mock("../../context", () => ({
  getContext: vi.fn(),
}))

import { getContext } from "../../context"
import { detectSomething } from "../../services/example.service"

describe("detectSomething", () => {
  beforeEach(() => {
    vi.mocked(getContext).mockReturnValue({
      runtime: "docker",
      region: "global",
      locale: "zh-CN",
      cwd: "/tmp/test",
    })
  })

  it("returns empty when no changes", () => {
    const result = detectSomething(mockRunner)
    expect(result.hasChanges).toBe(false)
  })
})
```

**Test priority:**

| Priority | Target                                 | Reason                           |
| -------- | -------------------------------------- | -------------------------------- |
| P0       | Pure functions (arg builders, parsers) | Easy to test, high value         |
| P0       | `infra/env.ts`, `infra/config.ts`      | System boundary validation       |
| P1       | Service discovery/detection logic      | Test with temp dirs, mock runner |
| P2       | Heavy external dependency services     | High mock cost, lower ROI        |

## Step-by-Step: Adding a New Command

1. **Identify if new domain logic is needed** → create `services/<name>.service.ts`
2. **Create command file** using `defineFluxCommand`:
   - Place in appropriate directory (`commands/`, `commands/dev/`, `commands/prod/`, `commands/db/`)
   - All `@clack/prompts` calls stay here
   - Orchestrate services for multi-step workflows
3. **Register in parent command's `subCommands`**:
   ```typescript
   // In parent command file
   subCommands: {
     "my-command": () => import("./my-command").then(m => m.myCommand),
   }
   ```
4. **Add i18n keys** to both `infra/i18n/zh-CN.ts` and `infra/i18n/en-US.ts`
5. **For symmetric dev/prod commands** → use `createComposeCommand` or `createComposeLogsCommand`

## Step-by-Step: Adding a New Service

1. **Create** `services/<name>.service.ts`
2. **Export functions** that accept `TaskRunner` and other dependencies as parameters
3. **Return data only** — no UI prompts, no `console.log`, no `@clack/prompts`
4. **Add tests** in `__tests__/services/<name>.service.test.ts`
5. **Import from commands** that need the service functionality

## Existing Services Reference

### alembic.service.ts

| Export               | Signature                                         | Purpose                        |
| -------------------- | ------------------------------------------------- | ------------------------------ |
| `buildMigrateArgs`   | `(plugin: Plugin, message: string) → string[]`    | Build `alembic revision` args  |
| `buildUpgradeArgs`   | `(pluginName?: string) → string[]`                | Build `alembic upgrade` args   |
| `buildDowngradeArgs` | `(pluginName: string, steps?: number) → string[]` | Build `alembic downgrade` args |
| `parseHeads`         | `(output: string) → Map<string, string>`          | Parse `alembic heads` output   |
| `parseCurrent`       | `(output: string) → Set<string>`                  | Parse `alembic current` output |
| `upgrade`            | `(runner, pluginName?) → Promise<void>`           | Execute upgrade                |
| `downgrade`          | `(runner, pluginName, steps?) → Promise<void>`    | Execute downgrade              |
| `migrate`            | `(runner, plugin, message) → Promise<void>`       | Execute revision               |
| `stamp`              | `(runner, revision) → Promise<void>`              | Execute stamp                  |
| `getHeads`           | `(runner) → Promise<Map<string, string>>`         | Query heads                    |
| `getCurrent`         | `(runner) → Promise<Set<string>>`                 | Query current                  |

### plugin.service.ts

| Export              | Signature                              | Purpose                                           |
| ------------------- | -------------------------------------- | ------------------------------------------------- |
| `Plugin`            | interface                              | `{ name, module, versionPath, hasMigrations }`    |
| `discoverPlugins`   | `() → Plugin[]`                        | Scan plugin directories                           |
| `findPlugin`        | `(name: string) → Plugin \| undefined` | Find plugin by name                               |
| `syncAlembicConfig` | `() → void`                            | Sync alembic.ini + env.py with discovered plugins |

### database.service.ts

| Export                  | Signature                                             | Purpose                              |
| ----------------------- | ----------------------------------------------------- | ------------------------------------ |
| `cleanMigrationFiles`   | `(runner) → void`                                     | Delete .py files from migration dirs |
| `dropAndRecreateSchema` | `(runner, ctx, creds) → Promise<void>`                | DROP + CREATE schema via psql        |
| `upgrade`               | `(runner) → Promise<void>`                            | `alembic upgrade heads` locally      |
| `seed`                  | `(runner) → Promise<void>`                            | `python src/initdb.py`               |
| `upgradeInCompose`      | `(runner, ctx, composeFile, service) → Promise<void>` | Upgrade via compose exec             |
| `seedInCompose`         | `(runner, ctx, composeFile, service) → Promise<void>` | Seed via compose exec                |

### migration.service.ts

| Export               | Signature                                     | Purpose                                    |
| -------------------- | --------------------------------------------- | ------------------------------------------ |
| `PluginChange`       | interface                                     | `{ type, table, detail }`                  |
| `PluginChangeInfo`   | interface                                     | `{ name, status, hasMigrations, changes }` |
| `detectChanges`      | `(runner) → { plugins, unassigned? }`         | Detect per-plugin model changes            |
| `generateForPlugins` | `(runner, plugins, message?) → Promise<void>` | Generate migrations for confirmed plugins  |

## Rules

### Architecture Rules

- NEVER import `@clack/prompts` in `services/` or `infra/` — UI belongs in `commands/` only
- NEVER put orchestration logic (multi-step workflows with branching) inside a service — that belongs in `commands/`
- NEVER duplicate `getContext()` → `createTaskRunner()` → `done()` boilerplate — use `defineFluxCommand`
- NEVER copy-paste symmetric dev/prod commands — use `createComposeCommand` or `createComposeLogsCommand` factory
- ALWAYS keep services as pure functions that accept dependencies as parameters
- ALWAYS validate external input (config files, env files, CLI args) with Zod schemas at boundaries
- ALWAYS add i18n keys to both `zh-CN.ts` and `en-US.ts` when adding user-facing strings

### Testing Rules

- ALWAYS write tests for new services — P0 for pure functions, P1 for mock-dependent
- ALWAYS mock `getContext` when testing services that depend on it
- PREFER testing with temporary directories for filesystem-dependent tests
- PREFER testing pure functions (arg builders, parsers) before integration-style tests

### Git Rules

- NEVER run `git add` or `git commit` — leave all version control operations to the user
- NEVER stage or commit files automatically after generating code
