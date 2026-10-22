import { RuleConfigSeverity, type UserConfig } from "@commitlint/types"

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
}

export default Configuration
