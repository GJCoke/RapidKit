# Git 规范

本项目通过 **Husky + lint-staged + CommitLint + cz-git** 构建完整的 Git 工作流规范，在提交前自动检查代码质量、校验提交信息格式。

## Husky Git Hooks

项目在 `.husky/` 目录下配置了四个 Git Hook，覆盖提交的完整生命周期。

### pre-commit

```bash
# 备份暂存区（用于 commitlint 失败后恢复）
git diff --cached --binary > .git/staged-backup.patch 2>/dev/null

pnpm precommit
```

执行 `pnpm precommit`，即运行 **lint-staged**，对暂存区文件执行检查和格式化。同时创建暂存区备份，确保后续 Hook 失败时能恢复。

### commit-msg

```bash
pnpm check:commit -- "$1"
```

执行 **CommitLint** 校验提交信息格式。如果校验失败，Hook 会自动从备份恢复暂存区内容，避免 lint-staged 的修改导致暂存区丢失。

::: warning 注意
如果 commitlint 校验失败，暂存区会被自动恢复。修正提交信息后直接重新提交即可，无需重新 `git add`。
:::

### pre-push

```bash
pnpm check:types
```

推送前执行 **TypeScript 类型检查**（通过 Turborepo 并行检查所有子项目），阻止类型错误的代码推送到远程。

### post-commit

```bash
rm -f .git/staged-backup.patch
```

提交成功后清理备份文件。

## lint-staged

lint-staged 在 pre-commit 阶段对 **暂存区文件** 执行检查，配置位于 `.lintstagedrc.json`：

| 文件匹配                                                      | 执行操作                                   |
| ------------------------------------------------------------- | ------------------------------------------ |
| `*.{ts,tsx,js,jsx,vue,md}`                                    | Prettier 格式化 + ESLint 检查修复          |
| `*.{js,ts,mjs,cjs,json,jsx,tsx,css,less,scss,vue,html,md,py}` | cSpell 拼写检查                            |
| `*.py`                                                        | Ruff 格式化 + Ruff Lint 检查 + ty 类型检查 |

::: info 说明
lint-staged 仅处理暂存区中的文件，不会影响未暂存的修改，保证检查范围精准且执行速度快。
:::

## CommitLint & cz-git

本项目使用 **CommitLint** 配合 **cz-git** 对 Git 提交信息进行规范化管理，保证提交信息统一、可读、便于自动生成变更日志（Changelog）和版本发布。

::: warning 注意
CommitLint CLI 用于执行提交信息校验

config-conventional 提供官方规范规则

cz-git 用于交互式提交提示
:::

### 规则说明

| 规则                   | 说明                                            |
| ---------------------- | ----------------------------------------------- |
| `type-enum`            | 提交类型必须在指定列表中，如 feat、fix、docs 等 |
| `body-leading-blank`   | 提交内容 body 前必须空一行                      |
| `footer-leading-blank` | footer 前必须空一行（警告级别）                 |
| `header-max-length`    | 提交信息 header 最大长度 108 字符               |
| `subject-empty`        | header 不能为空                                 |
| `type-empty`           | type 不能为空                                   |
| `subject-case`         | 禁用 subject 大小写限制                         |

### 提交类型（type）

| 类型     | 描述                                                |
| -------- | --------------------------------------------------- |
| build    | 构建系统或外部依赖的修改（npm、webpack、docker 等） |
| chore    | 杂项: 不影响 src/test 的修改（配置、脚本等）        |
| ci       | 持续集成配置修改（GitHub Actions、Jenkins 等）      |
| docs     | 文档修改（README、CHANGELOG、doc 文件等）           |
| feat     | 新功能开发                                          |
| fix      | 修复 bug                                            |
| perf     | 性能优化                                            |
| refactor | 代码重构，无新增功能和 bug 修复                     |
| revert   | 回滚提交                                            |
| style    | 代码格式修改，不影响逻辑                            |
| test     | 添加/修改/修复测试用例                              |

### 作用域（scope）

| scope                           | 描述       |
| ------------------------------- | ---------- |
| root                            | 根目录     |
| backend                         | 后端模块   |
| frontend                        | 前端模块   |
| desktop                         | 桌面端模块 |
| website                         | 网站模块   |
| internal                        | 内部工具   |
| components                      | UI 组件    |
| utils                           | 工具函数   |
| alova/axios/builder/color/hooks | 各功能模块 |

::: warning 注意
`allowCustomScopes: true` 允许自定义 scope。

如果需要添加新的作用域，请前往 `commitlint.config.ts` 文件中的 `scopes` 配置项进行添加。
:::

### 提交交互提示（prompt）

- **type**: 选择提交类型
- **scope**: 选择影响范围（可选）
- **subject**: 简述提交内容
- **body**: 详细描述（可选）
- **footer**: 关联 Issue 或 BREAKING CHANGE（可选）
- **confirmCommit**: 提交前确认

### 使用方式

**交互式提交：** 运行 `pnpm commit`，按提示选择 type、scope、subject 等信息。

**普通提交：** 校验会自动生效。

```bash
git commit -m "feat(frontend): add login page"
```

如果提交信息不符合规则，CommitLint 会报错并阻止提交。

## Changesets 版本管理

项目使用 **Changesets** 管理版本和变更日志。详细用法请参阅 [Changesets 使用指南](/guide/changeset)。

## 完整工作流

一次完整的 Git 提交会依次经过以下步骤：

1. `git add` -- 将文件加入暂存区
2. `git commit` -- 触发 Husky Hooks
3. **pre-commit** -- lint-staged 检查 + 暂存区备份
4. **commit-msg** -- CommitLint 校验提交信息（失败则恢复暂存区）
5. **post-commit** -- 清理备份文件
6. `git push` -- 触发 pre-push
7. **pre-push** -- TypeScript 类型检查

::: tip 提示
建议使用 `pnpm commit` 进行交互式提交，避免手写提交信息格式错误。
:::
