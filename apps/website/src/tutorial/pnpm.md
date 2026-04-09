# pnpm 工作区

## 简介

[pnpm](https://pnpm.io/) 是一个快速、节省磁盘空间的 Node.js 包管理器。与 npm/yarn 不同，pnpm 使用内容寻址存储 (
Content-Addressable Storage)，所有依赖包只会在磁盘上保存一份，项目中通过硬链接引用，大幅减少磁盘占用。

::: tip 为什么选择 pnpm
本项目是一个 monorepo，包含前端、桌面端、文档站和共享包等多个子项目。pnpm 原生支持 workspace，配合 Turborepo
可以实现高效的多包管理和构建编排。
:::

## 安装

本项目要求 pnpm >= 10.20.0，Node.js >= 24.11.0。

### 通过 Corepack 安装 (推荐)

Node.js 内置的 Corepack 可以自动管理包管理器版本：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

::: info 说明
项目根目录 `package.json` 中声明了 `"packageManager": "pnpm@10.27.0"`，Corepack 会自动使用该版本。
:::

### 通过 npm 安装

```bash
npm install -g pnpm
```

安装完成后验证：

```bash
pnpm -v
```

## Workspace 概念

项目根目录下的 `pnpm-workspace.yaml` 定义了 monorepo 的工作区结构：

```yaml
packages:
  - apps/* # 应用层：前端、后端、桌面端
  - docs/* # 文档站
  - packages/* # 共享包：编辑器、工具库等
```

pnpm 会将这些目录下的每个子目录视为一个独立的包，统一管理依赖关系。

### workspace:\* 协议

在 monorepo 中，子包之间的依赖使用 `workspace:*` 协议声明。例如前端项目依赖共享编辑器包时：

```json
{
  "dependencies": {
    "@rapidkit/editor": "workspace:*"
  }
}
```

::: warning 注意
`workspace:*` 表示始终使用本地工作区中的版本。发布时 pnpm 会自动将其替换为实际的版本号。
:::

## 常用命令

| 命令                            | 说明                              |
| ------------------------------- | --------------------------------- |
| `pnpm install`                  | 安装所有工作区的依赖              |
| `pnpm dev:frontend`             | 启动前端开发服务器                |
| `pnpm dev:backend`              | 启动后端开发服务器                |
| `pnpm dev:website`              | 启动文档站开发服务器              |
| `pnpm build`                    | 构建所有包（通过 Turborepo 编排） |
| `pnpm --filter <pkg> <cmd>`     | 对指定包执行命令                  |
| `pnpm add <dep> --filter <pkg>` | 向指定包添加依赖                  |

`--filter` 参数支持包名和目录路径两种写法：

```bash
# 按包名过滤
pnpm --filter @rapidkit/frontend dev

# 按目录过滤
pnpm --filter ./apps/frontend dev
```

::: danger 注意
本项目是 monorepo 工程，请始终使用 `pnpm` 安装依赖，切勿使用 `npm` 或 `yarn`，否则会破坏工作区的依赖结构。
:::

## Turborepo 集成

项目使用 [Turborepo](https://turbo.build/) 作为构建编排工具，配置文件为根目录下的 `turbo.json`。

### 构建依赖顺序

`turbo.json` 中通过 `dependsOn: ["^build"]` 声明了构建依赖关系：当执行 `turbo build` 时，Turborepo
会自动分析包之间的依赖关系，按正确的拓扑顺序构建。例如共享包会先于依赖它的应用构建。

```bash
# 构建所有包（自动处理依赖顺序）
pnpm build

# 仅构建指定包及其依赖
turbo build --filter @rapidkit/frontend
```

### 任务缓存

Turborepo 会缓存构建产物（`dist/**`），如果源码未变更则跳过构建，显著加速 CI/CD 流程。

## 常见问题

### 锁文件冲突

多人协作时 `pnpm-lock.yaml` 可能产生合并冲突。解决方法是保留任意一方的版本，然后重新安装：

```bash
pnpm install
```

pnpm 会根据各包的 `package.json` 重新生成正确的锁文件。

### 依赖提升问题

pnpm 默认采用严格的依赖隔离策略，子包只能访问自己声明的依赖。如果某个包需要访问未声明的依赖（通常是旧版库的隐式依赖），可以在根目录
`.npmrc` 中配置提升规则：

```ini
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*
```

::: tip 提示
遇到 "Module not found" 错误时，优先检查该依赖是否在对应包的 `package.json` 中正确声明，而非直接配置提升。
:::

### 幽灵依赖

npm/yarn 允许访问未在 `package.json` 中声明的依赖（幽灵依赖），但 pnpm 默认禁止这种行为。如果从 npm/yarn 迁移到 pnpm
后出现找不到模块的错误，需要将缺失的依赖显式添加到 `package.json` 中。
