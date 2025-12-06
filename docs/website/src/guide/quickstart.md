# 快速开始

## 环境准备

确保你的环境满足以下要求：
::: warning 注意
请确保你的环境满足需求，否则会导致安装失败。
:::

- git: 你需要 git 来克隆和管理项目版本。
- Node.js: >= 24.11.0，推荐使用更高版本
- pnpm: >= 10.20.0，推荐使用最新版本
- uv: >= 0.9.15，推荐使用最新版本
- Python: >= 3.12，推荐使用更高的兼容版本 (可使用`uv`自动安装)
- Docker / Podman (可选)

## 安装 `uv`

一个用 `Rust` 编写的极速 `Python` 包和项目管理工具。
::: tabs
=== MacOS/Linux
使用 `curl` 下载脚本并通过 `sh` 执行：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

如果系统没有 `curl`，可以使用 `wget`：

```bash
wget -qO- https://astral.sh/uv/install.sh | sh
```

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install uv
```

=== Windows
使用 `irm` 下载脚本并通过 `iex` 执行：

```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

更改 [执行策略](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-7.4#powershell-execution-policies) 允许运行来自互联网的脚本。
:::

::: info 提示
更多安装方式请查看 [uv 官方文档](https://uv.doczh.com/getting-started/installation/#pypi)
:::

### 验证安装

```bash
uv --version
```

## 安装 Node.js

### 官方安装包

1. 访问 Node.js 官网：https://nodejs.org/
2. 下载 **LTS（长期支持）** 版本
3. 按照系统安装向导安装即可

### 使用 Homebrew（macOS / Linux）

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install node
```

### 验证安装

```bash
node -v   # 查看 Node.js 版本
npm -v    # 查看 npm 版本
```

## 安装 `pnpm`

### 使用 npm 安装 (推荐)

前提：你已经安装了 Node.js（v24.11+）

```bash
npm install -g pnpm
```

### 使用 Homebrew（macOS / Linux）

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install pnpm
```

### 验证安装

```bash
pnpm -v
```

## 安装 Git

::: tabs
== MacOS

#### 通过 Homebrew（推荐）

```bash
brew install git
```

#### 通过官方安装包

1. 访问 Git 官网：https://git-scm.com/
2. 下载 macOS 安装包
3. 按照系统安装向导安装即可
   == Windows

#### 官方安装包

1. 下载：https://git-scm.com/install/windows
2. 下载 Windows 安装包
3. 按照系统安装向导安装即可

#### 通过包管理器（如 Chocolatey）

```bash
choco install git
```

== Linux

```bash
sudo apt update
sudo apt install git -y
```

:::

### 验证安装

```bash
git --version
```

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
