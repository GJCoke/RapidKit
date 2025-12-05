## Husky 提交钩子配置与使用指南

本指南介绍如何在项目中使用 Husky 来管理 Git 钩子，从而在提交代码前执行自动化检查，例如代码格式校验、Lint 检查、单元测试等。

## 什么是 Husky？

Husky 是一个 Git Hooks 管理工具，可以让你在 Git 的生命周期事件中执行脚本，例如：

- 提交前验证代码格式
- 提交信息检查
- 推送前执行测试
- 防止不规范代码进入仓库

Husky 的优势包括：

- 安装简单
- 与各种工具高度兼容（如 ESLint、Prettier、CommitLint）
- 不依赖全局环境
- 配置灵活

## Husky 的目录结构

Husky 会在项目根目录生成一个目录，用于存放所有 Git Hooks。

```text
.husky/
  pre-commit
  commit-msg
  pre-push
```

每个文件对应一个 Git 钩子，钩子触发时 Husky 会自动执行其中的脚本。

## 常见的 Git 钩子说明

以下列出本项目钩子及其作用：

### 1. pre-commit

在执行 Git commit 之前触发。

- 运行 Lint 工具
- 格式化代码
- 校验拼写

如果此钩子执行失败，提交会被阻止。

### 2. commit-msg

在提交信息写入后、真正提交前触发。  
与 CommitLint 一起使用，用于校验提交信息是否符合规范。

### 3. pre-push

在执行 Git push 之前触发。  
用于：

- 检查构建是否正常
- 防止推送有问题的代码

## 与其他工具的集成方式

Husky 常与以下工具配合使用：

### 1. 与 ESLint 集成

用于避免提交未通过 Lint 的代码。

### 2. 与 Prettier 集成

自动格式化代码，保证风格一致。

### 3. 与 CommitLint 集成

校验提交信息格式。例如是否符合 Conventional Commits。

### 4. 与 Lint-Staged 配合

仅检查本次提交涉及的文件，提高性能。

## 示例工作流说明

以下是常见的 Husky 使用流程示例：

1. 在提交代码前，触发 pre-commit 钩子  
   自动执行代码格式检查、Lint、拼写检查等。

2. 在填写提交信息后，触发 commit-msg  
   校验提交信息是否符合规范。如果不符合，会阻止提交。

3. 在推送到远端前，触发 pre-push  
   运行测试，阻止含错误的代码进入仓库。

## 排查与调试

如果 Husky 钩子没有被触发，可以通过以下方式排查：

- 确认项目根目录存在 `.husky` 文件夹
- 检查是否未安装依赖
- 如果在 Windows 上，确认 Git Bash 或其他支持 Unix shell 的环境是否可用
- 查看 Git 钩子权限是否正确
- 检查脚本中是否存在语法错误

## 最佳实践

建议项目采用以下 Husky 配置策略：

1. 将与提交相关的检查放在 pre-commit
2. 将提交信息规范检查放在 commit-msg
3. 将运行测试等耗时操作放在 pre-push
4. 结合 lint-staged 避免 Lint 全量执行
5. 将 Husky 配置纳入版本管理，保证团队规范统一

## 总结

Husky 是前端与后端项目中常用的 Git Hook 管理工具，通过配置不同的钩子，可以确保项目代码质量、统一提交信息规范、避免错误代码进入主分支。  
结合 CommitLint、ESLint、Prettier、Lint-Staged 等工具，可以构建一套完整的代码质量保障体系。
