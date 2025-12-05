## Changesets Changelog 编写模板

本文档用于指导开发者在使用 Changesets 时，如何编写标准、清晰、可自动生成优质 Changelog 的变更说明文件。

## 编写位置

每次变更需执行：

```bash
pnpm changeset
```

Changesets 会在 `.changeset/` 目录下生成一个类似：

`.fresh-carrots-fly.md`的文件，你需要编辑其中的内容。

## 文件结构说明

Changesets 生成的基础结构如下：

```markdown
---
"package-a": patch
"package-b": minor
"package-c": major
---

你的更新描述内容
```

解释：

| 字段                 | 说明                             |
| -------------------- | -------------------------------- |
| `"package-a": patch` | patch = 修复类修改，不破坏 API   |
| `"package-b": minor` | minor = 新增特性，兼容旧版       |
| `"package-c": major` | major = 破坏性更新，需要用户迁移 |

## 写 Changelog 的基本规范

### 写法要清晰

- 用一句话讲清楚做了什么
- 必要时加上补充说明
- 不要写无意义内容（如 “fix something”）

### 站在使用者角度说明影响

包括但不限于：

- 为什么要改？
- 用户可能何时依赖到这个变更？
- 是否有额外迁移步骤？

## 模板

以下是一个完整模板：

```markdown
---
"your-package-name": minor
---

### Features

- 新增 `DatePicker` 组件的 `rangeMode` 属性，允许用户在范围选择模式下高亮选择段。

### Fix Bugs

- 修复分页器在禁用状态下仍能触发点击事件的问题。

### Notes

- 默认主题颜色略有调整，但不影响现有布局。
- 无破坏性修改，升级无需额外操作。

### 背景说明（可选）

该变更来自用户反馈，希望能够在日期范围选择时提供更多标记能力，因此增加了扩展模式。
```
