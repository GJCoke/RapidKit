## VS Code 隐藏指定文件夹 / 文件的配置指南

在使用 VS Code 开发过程中，项目中常会生成缓存目录、日志文件、编译产物等无需频繁查看的文件 / 文件夹，通过配置排除规则可隐藏这些内容，让资源管理器更整洁，提升开发效率。以下是详细配置步骤及常用排除规则：

## 一、快速配置步骤

### 方式 1：通过设置界面配置（可视化操作）

1. 打开 VS Code 设置界面：

- 菜单栏操作：`文件(File) -> 首选项(Preferences) -> 设置(Settings)`；
- 快捷键操作：Windows/Linux 按 `Ctrl + ,`，Mac 按 `Command + ,`。

2. 在设置搜索框中输入 files.exclude，定位到「文件排除」配置项（Files: Exclude）。
3. 点击配置项右侧的「添加项 (Add Item)」按钮，输入需要排除的目录 / 文件规则（规则语法见下文）。

- 示例：依次添加 `**/__pycache__`、`**/.ruff_cache`、`**/.mypy_cache `即可隐藏 Python 相关缓存目录。

4. 配置后即时生效，无需重启 VS Code，资源管理器中对应目录 / 文件会立即隐藏。

### 方式 2：通过 settings.json 手动配置

1. 打开 项目 `.vscode/settings.json` 文件。
2. 在 JSON 文件中找到 `files.exclude` 字段（若无则手动添加），按以下格式添加排除规则：

```json
{
  "files.exclude": {
    "**/.ruff_cache": true,
    "**/__pycache__": true,
    "**/.mypy_cache": true,
    "**/.turbo": true,
    "**/.idea": true
  }
}
```

3. 保存文件（`Ctrl/Save + S`），配置立即生效。

## 二、排除规则语法说明

VS Code 的排除规则基于「Glob 语法」，核心规则如下：
| 语法 | 含义 | 示例 |
| ------| --------------------------| ---------------------------------------------|
| `**` | 匹配任意层级的目录 | `**/node_modules` 匹配所有目录下的 node_modules |
| `*` | 匹配任意字符（不含路径分隔符） | `*.log` 匹配所有 .log 后缀文件 |
| `?` | 匹配单个字符 | `test?.py` 匹配 test1.py、test2.py 等 |
| `!` | 反向排除（显示指定内容） | `!**/src/__pycache__` 仅显示 src 目录下的 **pycache** |

## 三、常用排除规则（按开发场景分类）

### 1. Python 开发常用（按需使用）

```json
"**/__pycache__": true,    // Python 字节码缓存目录
"**/.ruff_cache": true,    // Ruff 代码检查缓存
"**/.mypy_cache": true,    // Mypy 类型检查缓存
"**/.pytest_cache": true,  // Pytest 测试缓存
"**/.venv": true,          // 虚拟环境目录
"**/venv": true,           // 虚拟环境目录（另一种命名）
"**/.env": true,           // 环境变量文件
"**/*.pyc": true,          // 编译后的 .pyc 文件
```

### 2. 前端开发常用（按需使用）

```json
"**/node_modules": true,   // npm 依赖目录
"**/dist": true,           // 打包产物目录
"**/build": true,          // 构建目录
"**/.git": true,           // Git 版本控制目录
"**/.DS_Store": true,      // Mac 系统隐藏文件
"**/npm-debug.log": true,  // npm 日志文件
```

### 3. 通用排除规则（按需使用）

```json
"**/.vscode": true,        // VS Code 本地配置目录（按需）
"**/tmp": true,            // 临时文件目录
"**/logs": true,           // 日志目录
"**/*.swp": true,          // Vim 交换文件
```

## 四、注意事项

1. 规则生效范围：默认是「工作区」级别，若需全局生效，可在设置界面切换到「用户」选项卡配置。
2. 反向排除：若需隐藏某类目录但保留特定子目录，可结合 ! 语法，例如：

```json
"**/node_modules": true,          // 隐藏所有 node_modules
"!**/my-package/node_modules": true  // 保留指定目录下的 node_modules
```

3. 配置还原：若误配置导致文件丢失，可删除 files.exclude 中对应规则，或点击设置界面的「重置」按钮恢复默认。
4. 实时预览：配置过程中可随时切换资源管理器，查看排除效果是否符合预期。

通过以上配置，可根据自身开发场景定制隐藏规则，让 VS Code 的资源管理器只显示核心开发文件，大幅提升开发体验。
