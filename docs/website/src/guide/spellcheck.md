## cSpell 拼写检查工具使用指南

本项目使用 **cSpell** 对代码、文档、配置文件进行拼写检查，确保标识符、注释和文档中的拼写规范。

## 配置文件说明

项目根目录使用 `cspell.json` 配置文件，关键配置如下：

- **import**: 引入外部字典文件，例如 TypeScript 和 Python
- **caseSensitive**: 是否区分大小写，false 表示不区分
- **words**: 自定义单词列表，常用的项目名、缩写、工具名等
- **ignorePaths**: 忽略检查的目录和文件，避免检查依赖、构建产物、二进制文件等
- **ignoreRegExpList**: 忽略正则匹配的内容，例如 URL、颜色代码
- **allowCompoundWords**: 是否允许复合单词
- **dictionaries**: 使用的自定义字典
- **dictionaryDefinitions**: 自定义字典文件及配置

示例自定义单词：

- mi、pnpm、vite、monorepo、eslint、prettier、commitlint、tsx、tsconfig、unocss

忽略路径示例：

- node_modules、dist、release、build、coverage、public、static、out、vendor、.venv、tmp
- 配置文件及锁文件：package.json、pnpm-lock.yaml、yarn.lock、tsconfig.json、eslint.config.ts、prettier.config.ts、commitlint.config.ts
- 文档和图片：_.md、_.svg、_.png、_.jpg
- 其他临时文件：\*.log、stats.html

忽略正则示例：

- URL：`http(s)?://`
- 颜色代码：`#[A-Za-z0-9]{6}`

## 自定义字典

- 自定义字典文件路径：`.cspell/custom-dictionary.txt`
- 在 `cspell.json` 中通过 `dictionaryDefinitions` 引入
- 配置 `"addWords": true` 表示可自动添加新单词到字典

使用方法：

- 在文件中出现未识别的单词时，cSpell 会提示
- 可以将正确的单词添加到自定义字典
- 下次检查时，该单词不会再被标记为错误

## 命令行检查

执行拼写检查：

```bash
pnpm lint:spellcheck
```

- 会扫描所有文件，排除 `ignorePaths` 中指定的路径
- 支持 glob 模式，例如 `src/**/*.ts`、`docs/**/*.md`

## VSCode 集成

1. 安装 **Code Spell Checker** 插件
2. 在项目中自动识别 `cspell.json`
3. 在编辑器中直接高亮拼写错误
4. 支持右键添加到自定义字典

## 注意事项

- 对于新语言或新工具，可以在 `words` 或自定义字典中添加
- ignorePaths 可以根据项目实际目录结构调整
- allowCompoundWords 建议保持 `true`，减少常用组合词误报

## 总结

- **cSpell** 可有效提升代码和文档的拼写规范性
- 结合自定义字典、ignorePaths 和 VSCode 插件，可以实现端到端拼写检查
- 适用于 Monorepo、前端、后端、文档和配置文件统一管理
