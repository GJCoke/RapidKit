# 快速开始

## 环境准备

确保你的环境满足以下要求：
::: warning 注意
请确保你的环境满足需求，否则会导致安装失败。
:::

- git: 你需要 git 来克隆和管理项目版本。
- Node.js: >= 24.11.0，推荐使用更高版本
- pnpm: >= 10.20.0，推荐使用最新版本
- Python: >= 3.12，推荐使用更高的兼容版本
- Docker / Podman (可选)

## 代码获取

### 从 GitHub 获取代码

```bash
git clone https://github.com/GJCoke/monorepo-example.git
```

## 安装依赖

::: danger 注意
因为项目使用了 `monorepo` 工程管理，所以只能使用 `pnpm` 进行安装，请勿使用 `npm` 或 `yarn`
:::

```bash
pnpm install
```

## 启动项目

::: tabs
== 前端

```bash
pnpm dev:frontend
```

== 后端

```bash
pnpm dev:backend
```

== 桌面端

```bash
pnpm dev:desktop
```

== 官网

```bash
pnpm dev:website
```

:::
