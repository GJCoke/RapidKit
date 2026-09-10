# Admin 集中式测试目录设计

## 背景

`apps/admin` 当前共有 108 个测试文件，测试文件以 `*.test.ts(x)` 或 `*.dom.test.ts(x)` 的形式跟随生产代码分布在 `src/` 下。其中 25 个 `*.dom.test.*` 文件通过文件级 Vitest 注释切换到 jsdom 环境；其余测试默认运行在 Node 环境。公共测试设施位于 `src/test/`。

这种布局便于就近查看，但让生产源码目录混入大量非生产文件，也使测试基础设施成为 `src/` 的一部分。本次调整将所有测试和测试专用设施迁移到独立的 `apps/admin/tests/`，同时保持现有测试行为不变。

## 目标

- `apps/admin/src/` 只保留生产代码和生产所需类型、样式及资源。
- 所有测试集中位于 `apps/admin/tests/`。
- 测试目录镜像 `src/` 的业务路径，使生产文件与测试文件之间存在稳定、可预测的映射。
- 保持现有 Node/jsdom 环境选择、测试语义和测试命名。
- 为新增测试建立明确约束，避免测试重新散落到 `src/`。

## 非目标

- 不重写或重新分类现有测试用例。
- 不在本次迁移中改变断言、mock、测试覆盖范围或运行环境。
- 不引入新的测试框架、浏览器测试框架或覆盖率工具。
- 不按 `unit`、`component`、`integration` 等类型重新划分现有测试。
- 不调整 `apps/admin` 之外应用或共享包的测试布局。

## 方案选择

采用“独立测试根目录 + 镜像源码结构”。未采用纯测试类型目录，因为同一业务模块的测试会分散到多个位置；未采用“测试类型 + 源码镜像”双层结构，因为当前测试尚无稳定的类型边界，迁移时分类会夹带行为与组织方式调整。

目标结构如下：

```text
apps/admin/
├── src/
│   ├── app/
│   ├── features/
│   ├── locales/
│   ├── services/
│   ├── shared/
│   ├── stores/
│   ├── styles/
│   └── views/
└── tests/
    ├── setup/
    │   ├── setup.ts
    │   ├── server.ts
    │   ├── render.tsx
    │   └── setup.test.tsx
    ├── app/
    ├── features/
    ├── locales/
    ├── services/
    ├── shared/
    ├── stores/
    ├── styles/
    └── views/
```

测试路径严格镜像被测生产模块。例如：

```text
src/features/router/route-model.ts
tests/features/router/route-model.test.ts

src/features/layout/components/page-tabs.tsx
tests/features/layout/components/page-tabs.test.ts
tests/features/layout/components/page-tabs.dom.test.tsx
```

## 导入与配置规则

### 生产代码导入

迁移后的测试统一使用现有 `@/*` 别名引用 `src/*`。禁止使用跨越测试根目录的 `../../src/...` 导入，避免测试路径深度变化影响导入语句。

### 测试设施导入

新增 `@test/*` 别名并映射到 `tests/*`。测试文件通过该别名使用共享渲染器、MSW server 或其他测试专用辅助代码。例如：

```ts
import { renderWithProviders } from "@test/setup/render"
```

测试设施不得被 `src/` 下的生产模块导入。

### TypeScript

`apps/admin/tsconfig.json` 同时纳入 `src/**/*` 与 `tests/**/*`，并新增：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@test/*": ["./tests/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "src/vite-env.d.ts"]
}
```

因此现有 `typecheck` 继续覆盖生产代码、测试和测试辅助设施。

### Vitest

Vitest 继续使用现有 Vite 配置，默认环境保持 `node`。只将 `setupFiles` 更新为：

```ts
setupFiles: ["./tests/setup/setup.ts"]
```

现有 `*.dom.test.*` 文件及其 `// @vitest-environment jsdom` 注释保持不变。本次不依据文件名自动选择环境，以免改变现有测试执行语义。

## 迁移策略

迁移按顶级业务目录分批进行：`app`、`features`、`locales`、`services`、`shared`、`stores`、`styles`、`views`，最后迁移 `src/test` 中的测试设施。每批迁移包含以下动作：

1. 在 `tests/` 下建立对应镜像路径并移动测试文件。
2. 将测试对生产代码的相对导入改为 `@/*`。
3. 将共享测试设施导入改为 `@test/*`。
4. 运行该批测试，确认路径变化未改变行为。

迁移期间不重命名测试、不重排测试内容、不顺手修改失败用例。若某个测试因路径迁移暴露对 `process.cwd()`、`import.meta.url` 或源码相邻目录的隐式依赖，应只把路径解析改为明确的仓库位置，并增加针对该路径契约的验证。

由于当前工作区存在大量未提交变更，实施时必须通过显式文件列表移动和暂存测试文件，禁止使用会覆盖或回滚现有工作的 Git 命令。

## 防回退约束

迁移完成后增加自动检查，扫描 `apps/admin/src` 并在发现以下文件时失败：

```text
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
```

该检查接入 Admin 的测试或 CI 流程。`src/` 中不再保留测试专用目录；新的共享测试工具必须放在 `tests/setup/` 或后续按职责拆出的 `tests/helpers/`。

## 验证策略

分批验证用于快速定位迁移错误，最终执行完整验证：

- Admin 全量 Vitest 测试通过，测试文件数与测试数量不得因目录迁移减少。
- `pnpm --filter @rapidkit/admin typecheck` 通过。
- `pnpm --filter @rapidkit/admin lint` 通过。
- `pnpm --filter @rapidkit/admin build` 通过。
- 扫描确认 `apps/admin/src` 下不存在测试文件和测试专用目录。
- 扫描确认 `apps/admin/tests` 的业务目录结构能够映射到 `apps/admin/src`。

若 lint 脚本会自动修改文件，应先使用项目支持的只检查模式；若项目没有只检查模式，则在实施计划中明确 lint 的写入影响，并只检查本次迁移涉及的文件差异。

## 验收标准

- 现有 108 个测试文件全部位于 `apps/admin/tests/`，没有遗漏或重复执行。
- `apps/admin/src/` 下不存在 `*.test.*`、`*.spec.*` 或测试专用设施。
- `tests/` 按照 `src/` 的业务路径组织，公共设施统一位于 `tests/setup/`。
- 测试使用 `@/*` 引用生产代码，使用 `@test/*` 引用测试设施。
- 默认 Node 环境和现有文件级 jsdom 环境保持不变。
- 全量测试、类型检查、lint 和生产构建通过。
- CI 能阻止后续在 `apps/admin/src/` 中新增测试文件。
