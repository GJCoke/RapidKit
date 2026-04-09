## CommitLint & cz-git 使用指南

本项目使用 **CommitLint** 配合 **cz-git** 对 Git 提交信息进行规范化管理，保证提交信息统一、可读、便于自动生成变更日志（Changelog）和版本发布。
::: warning 注意
CommitLint CLI 用于执行提交信息校验

config-conventional 提供官方规范规则

cz-git 用于交互式提交提示
:::

## 规则说明

| 规则                   | 说明                                            |
| ---------------------- | ----------------------------------------------- |
| `type-enum`            | 提交类型必须在指定列表中，如 feat、fix、docs 等 |
| `body-leading-blank`   | 提交内容 body 前必须空一行                      |
| `footer-leading-blank` | footer 前必须空一行（警告级别）                 |
| `header-max-length`    | 提交信息 header 最大长度 108 字符               |
| `subject-empty`        | header 不能为空                                 |
| `type-empty`           | type 不能为空                                   |
| `subject-case`         | 禁用 subject 大小写限制                         |

## 提交类型（type）

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

## 作用域（scope）

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

## 提交交互提示（prompt）

- **type**: 选择提交类型
- **scope**: 选择影响范围（可选）
- **subject**: 简述提交内容
- **body**: 详细描述（可选）
- **footer**: 关联 Issue 或 BREAKING CHANGE（可选）
- **confirmCommit**: 提交前确认

## 使用方式

### 交互式提交

运行 `pnpm commit`，会按提示选择 type、scope、subject、body、footer 等信息。

### 普通提交（校验会自动生效）

例如：

```bash
git commit -m "feat(frontend): add login page"
```

如果提交信息不符合规则，CommitLint 会报错并阻止提交。

## 总结

- CommitLint + cz-git 强制团队使用统一的提交规范
- 保证提交信息可读、可追踪，便于自动生成 Changelog
- 与 CI/CD、自动发布流程结合，提升项目管理规范性
