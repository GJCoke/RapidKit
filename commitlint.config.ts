import { RuleConfigSeverity } from "@commitlint/types"
import { type UserConfig } from "cz-git"

/**
 * @see https://commitlint.js.org/reference/rules-configuration.html
 */
const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  formatter: "@commitlint/format",
  rules: {
    "type-enum": [
      RuleConfigSeverity.Error,
      "always",
      ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"],
    ],
    "body-leading-blank": [RuleConfigSeverity.Error, "always"],
    "footer-leading-blank": [RuleConfigSeverity.Warning, "always"],
    "header-max-length": [RuleConfigSeverity.Error, "always", 108],
    "subject-empty": [RuleConfigSeverity.Error, "never"],
    "type-empty": [RuleConfigSeverity.Error, "never"],
    "subject-case": [RuleConfigSeverity.Disabled],
  },
  prompt: {
    types: [
      { value: "build", name: "构建: 构建系统或外部依赖的修改(例如 npm、webpack、docker 等)" },
      { value: "chore", name: "杂项: 其他不修改 src 或 test 的日常事务(如修改配置文件、脚本等)" },
      { value: "ci", name: "持续集成: 修改 CI 配置文件和脚本(如 GitHub Actions、Jenkins 等)" },
      { value: "docs", name: "文档: 仅文档相关的修改(README、CHANGELOG、doc 文件等)" },
      { value: "feat", name: "新功能: 新增功能或特性" },
      { value: "fix", name: "修复: 修复 bug" },
      { value: "perf", name: "性能优化: 提升性能相关的修改" },
      { value: "refactor", name: "重构: 代码重构，既不新增功能也不修复 bug" },
      { value: "revert", name: "回滚: 撤销之前的提交" },
      { value: "style", name: "格式: 仅修改空格、格式缩进、分号等，不影响代码逻辑" },
      { value: "test", name: "测试: 添加、修改或修复测试用例" },
    ],
    scopes: [
      "root",
      "backend",
      "frontend",
      "desktop",
      "website",
      "internal",
      "components",
      "utils",
      "alova",
      "axios",
      "builder",
      "color",
      "hooks",
    ],
    allowCustomScopes: true,
    skipQuestions: ["breaking"],
    messages: {
      type: "请选择提交类型",
      scope: "请选择影响范围(可选):",
      subject: "请简要描述更新:",
      body: "请详细描述更新(可选):",
      footerPrefixesSelect: "请添加相关 ISSUES、BREAKING CHANGE 等相关链接(可选):",
      footer: "列出本次更改影响的任何问题。例如：#31, #34(可选)",
      confirmCommit: "请确认是否提交？",
    },
  },
}

export default Configuration
