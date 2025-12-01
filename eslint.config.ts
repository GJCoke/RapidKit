import { defineConfig } from "eslint/config"
import eslint from "@eslint/js"
import tsESLint from "typescript-eslint"
import eslintPluginPrettier from "eslint-plugin-prettier"
import eslintPluginVue from "eslint-plugin-vue"
import globals from "globals"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import vueParser from "vue-eslint-parser"

const ignores = [
  "**/dist/**",
  "**/release/**",
  "**node_modules/**",
  ".*",
  "scripts/**",
  "**/*.d.ts",
  "**/.venv/**",
  "*.log",
  "*.md",
  "**/.vitepress/cache/**",
]

/**
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 * */
export default defineConfig(
  // 通用配置
  {
    ignores, // 忽略目录
    extends: [eslint.configs.recommended, ...tsESLint.configs.recommended, eslintConfigPrettier], // 继承规则
    plugins: {
      prettier: eslintPluginPrettier,
    }, // 插件支持
    languageOptions: {
      ecmaVersion: "latest", // ecma 语法支持版本
      sourceType: "module", // 模块化类型
      parser: tsESLint.parser, // 解析器
    },
    rules: {
      // 自定义规则
      "no-var": "error", // 禁止使用 var
      "no-empty": "off",
      "no-undef": "off",
      eqeqeq: "error", // 必须使用 === / !==
      "prefer-const": "error", // 优先使用 const
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // 前端配置 Vue3
  {
    ignores, // 忽略目录
    files: ["apps/web/**/*.{ts,js,tsx,jsx,vue}", "packages/components/**/*.{ts,js,tsx,jsx,vue}"], // 应用范围
    extends: [...eslintPluginVue.configs["flat/recommended"], eslintConfigPrettier], // 继承规则
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsESLint.parser,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser, // 添加浏览器全局变量
      },
    },
    rules: {
      "vue/multi-word-component-names": [
        "warn",
        {
          ignores: ["index", "App", "Register", "[id]", "[url]"],
        },
      ],
    },
  },
  // 后端配置 electron node
  {
    ignores, // 忽略目录
    files: ["apps/desktop/**/*.{ts,js}"], // 应用范围
    languageOptions: {
      globals: {
        ...globals.node, // 添加 node 全局变量
      },
    },
  },
)
