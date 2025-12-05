## Changesets Changelog 编写模板

本文档用于指导开发者在使用 Changesets 时，如何编写标准、清晰、可自动生成优质 Changelog 的变更说明文件。

## 创建变更

当你对包做了功能更新、修复或者破坏性更新时，运行：

```bash
pnpm changeset
```

然后会进入交互式提示(空格是选中、回车是进入下一步)：

1. 选择修改了哪些包
2. 选择版本类型:

   | 字段    | 说明                     |
   | ------- | ------------------------ |
   | `patch` | 修复类修改，不破坏 API   |
   | `minor` | 新增特性，兼容旧版       |
   | `major` | 破坏性更新，需要用户迁移 |

3. 生成的文件会在 .changeset 文件夹中，文件名是随机的 Markdown 文件，记录了本次变更信息。
   ::: warning 注意
   Changesets 会在 `.changeset/` 目录下生成一个类似：`fresh-carrots-fly.md`的文件，你可以编辑其中的内容。
   :::

## 查看 Changeset 状态

可以运行：

```bash
pnpm changeset status
```

查看当前有哪些变更待发布，以及每个变更对应的版本类型。

## 更新版本号和生成 Changelog

当准备发布版本时，运行：

```bash
pnpm sync:version
```

这会做以下事情：

1. 根据 `.changeset` 文件自动更新 `package.json` 的版本号。
2. 更新各包的 `CHANGELOG.md`。
3. 同步各包的 `CHANGELOG.md` 到 `docs/website/changelog` 目录。

::: warning 建议场景
如果你并不需要执行 `步骤3` 则可以使用 `pnpm changeset version` 命令。

你已经完成了多次开发和 commit，需要统一发布版本。

准备执行 `pnpm publish` 之前。
:::

## 发布到 npm

更新版本后，执行：

```bash
pnpm publish -r
```

> -r 表示递归发布 monorepo 下的包。

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

### 什么时候运行 `pnpm changeset`

- 你在 `utils` 包里修复了一个 bug → 生成 patch 变更
- 你在 `frontend` 包里增加了新功能 → 生成 minor 变更
- 你修改了 `backend` 包的接口，可能影响依赖者 → 生成 major 变更

::: warning 注意
开发阶段每次完成功能或者修复后都可以运行 `pnpm changeset`，以便后续统一管理版本和 `Changelog`。
:::

### 版本号增加规则

Changesets 使用 [语义化版本号 SemVer](https://semver.org/) ，格式为：

```text
MAJOR.MINOR.PATCH
```

::: warning 注意

- 如果一个包依赖于另一个包发生了 major 更新，那么依赖包通常也会被提升至少 patch 或 minor 版本（取决于配置）。
- Changesets 会自动计算依赖链的版本更新，保证版本号合理。
  :::
