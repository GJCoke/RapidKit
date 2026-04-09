## Prettier 配置与使用指南

本项目使用 **Prettier** 作为统一的代码格式化工具，结合 ESLint、Husky、lint-staged 等工具确保代码风格一致、可读性高，并在提交前自动格式化。

## 配置文件说明

| 配置项                          | 说明                                           |
| ------------------------------- | ---------------------------------------------- |
| `printWidth: 120`               | 单行最大字符数，超过会自动换行                 |
| `tabWidth: 2`                   | 每级缩进 2 个空格                              |
| `semi: false`                   | 行尾不添加分号                                 |
| `singleQuote: false`            | 默认使用双引号 `" "`                           |
| `quoteProps: "as-needed"`       | 仅在必要时为对象属性添加引号                   |
| `trailingComma: "all"`          | 多行结构末尾自动添加逗号                       |
| `arrowParens: "always"`         | 箭头函数参数总是加括号 `(x) => {}`             |
| `endOfLine: "lf"`               | 统一使用 LF 换行符                             |
| `vueIndentScriptAndStyle: true` | Vue SFC 的 `<script>` / `<style>` 内按层级缩进 |

## 运行 Prettier 格式化代码

手动格式化所有项目文件：

```bash
pnpm check:format
```

指定单独的应用：

```bash
pnpm format -F @rapidkit/frontend
```

检查（不修改）代码格式：

```bash
pnpm prettier --check .
```

## VSCode 集成

1. 安装 **Prettier - Code Formatter** 插件
2. 在 `.vscode/settings.json` 中加入：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

这样你每次在 VSCode 保存文件时，Prettier 会自动格式化。

## Git 提交自动格式化

项目启用了 **Husky + lint-staged**，会在提交前自动执行格式化。详情见 `.lintstagedrc.json`

## 总结

本项目通过 Prettier 保证代码格式统一，搭配 ESLint、Husky、lint-staged 组成完整的自动化代码质量体系。开发者无需关心格式细节，只需专注于逻辑本身，所有格式问题都会自动完成。

如需修改 Prettier 规则，可直接编辑 `prettier.config.ts` 并重新执行格式化命令。
