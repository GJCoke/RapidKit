# Monaco Code Editor Design Spec

## Overview

在现有 Vue/NaiveUI 管理后台中嵌入基于 Monaco Editor 的代码编辑器，支持多语言脚本的编辑、保存和在线执行。采用分层架构：通用编辑器组件包（`packages/editor`）+ 脚本管理业务页面（`apps/frontend`）+ 后端 Script Domain（`apps/backend`）。

## Requirements

- 嵌入 Monaco Editor 到管理后台，支持代码高亮、智能提示、多光标等核心编辑能力
- 支持多语言：Python、JavaScript、Shell（编辑和执行）
- 第一版为单文件编辑，架构预留多文件扩展能力
- 代码保存到后端数据库，支持在线执行并展示结果
- 执行结果在编辑器下方输出面板展示（stdout/stderr/耗时）
- 执行权限和编辑权限分离，所有执行操作记录审计日志
- 编辑器组件可复用，其他页面可独立引入

## Architecture

### 分层设计

```
packages/editor/              ← 通用 Monaco Editor Vue 组件包（@coke/editor）
├── src/
│   ├── MonacoEditor.vue      ← 核心编辑器组件
│   ├── OutputPanel.vue       ← 输出面板组件
│   ├── types.ts              ← 公共类型定义
│   └── index.ts              ← 导出
└── package.json

apps/frontend/                ← 脚本管理页面
├── src/views/script/
│   ├── index.vue             ← 脚本列表页
│   └── modules/
│       ├── editor-page.vue   ← 编辑器页面（工具栏 + 编辑器 + 输出）
│       └── script-drawer.vue ← 脚本详情抽屉

apps/backend/                 ← Script Domain
├── src/domains/script/
│   ├── api.py                ← REST API
│   ├── crud.py               ← CRUD 操作
│   ├── models.py             ← 数据模型
│   ├── schemas.py            ← Pydantic schemas
│   └── services.py           ← 代码执行逻辑
```

### 数据流

1. 用户在编辑器页面编写代码
2. `Ctrl+S` 触发保存 → 调用 `PUT /api/v1/scripts/{id}` 保存到数据库
3. `Ctrl+Enter` 触发执行 → 调用 `POST /api/v1/scripts/{id}/execute`
4. 后端 subprocess 执行代码，捕获 stdout/stderr，记录审计日志
5. 同步返回执行结果，前端 OutputPanel 展示

## Component Design — packages/editor

### MonacoEditor.vue

Props:

| Prop         | Type                | Default     | Description              |
| ------------ | ------------------- | ----------- | ------------------------ |
| `modelValue` | `string`            | `""`        | v-model 双向绑定代码内容 |
| `language`   | `string`            | `"python"`  | Monaco 语言标识          |
| `theme`      | `"vs" \| "vs-dark"` | `"vs-dark"` | 编辑器主题               |
| `readOnly`   | `boolean`           | `false`     | 是否只读                 |
| `minimap`    | `boolean`           | `true`      | 是否显示缩略图           |
| `height`     | `string`            | `"100%"`    | 编辑器高度               |

Events:

| Event               | Payload  | Description       |
| ------------------- | -------- | ----------------- |
| `update:modelValue` | `string` | 内容变化          |
| `save`              | —        | 用户按 Ctrl+S     |
| `run`               | —        | 用户按 Ctrl+Enter |

### OutputPanel.vue

Props:

| Prop      | Type                                          | Description     |
| --------- | --------------------------------------------- | --------------- |
| `output`  | `string`                                      | stdout 输出     |
| `error`   | `string \| null`                              | stderr 错误信息 |
| `status`  | `"idle" \| "running" \| "success" \| "error"` | 执行状态        |
| `runtime` | `number \| null`                              | 执行耗时（秒）  |

### 使用示例

```vue
<MonacoEditor v-model="code" language="python" @save="onSave" @run="onRun" />
<OutputPanel :output="result.stdout" :error="result.error" :status="execStatus" />
```

## Backend Design — Script Domain

### Script Model

| Field         | Type                   | Description                             |
| ------------- | ---------------------- | --------------------------------------- |
| `name`        | `str (max_length=255)` | 脚本名称                                |
| `description` | `str`                  | 描述                                    |
| `language`    | `str (max_length=50)`  | 语言标识（python / javascript / shell） |
| `code`        | `Text`                 | 代码内容                                |
| `status`      | `Status`               | 启用 / 禁用                             |

继承 `SQLModel` 基类，自动包含 `id`、`create_time`、`update_time`。

### ScriptExecution Model（审计）

| Field         | Type           | Description      |
| ------------- | -------------- | ---------------- |
| `script_id`   | `UUID (FK)`    | 关联脚本         |
| `executor_id` | `UUID (FK)`    | 执行人           |
| `language`    | `str`          | 执行语言         |
| `code`        | `Text`         | 执行时的代码快照 |
| `stdout`      | `Text \| None` | 标准输出         |
| `stderr`      | `Text \| None` | 错误输出         |
| `exit_code`   | `int`          | 退出码           |
| `runtime`     | `float`        | 执行耗时（秒）   |

### API

| Method   | Path                           | Permission       | Description |
| -------- | ------------------------------ | ---------------- | ----------- |
| `POST`   | `/api/v1/scripts`              | `script:write`   | 创建脚本    |
| `GET`    | `/api/v1/scripts`              | `script:read`    | 分页列表    |
| `GET`    | `/api/v1/scripts/{id}`         | `script:read`    | 脚本详情    |
| `PUT`    | `/api/v1/scripts/{id}`         | `script:write`   | 更新脚本    |
| `DELETE` | `/api/v1/scripts/{id}`         | `script:write`   | 删除脚本    |
| `POST`   | `/api/v1/scripts/{id}/execute` | `script:execute` | 执行脚本    |

### 执行引擎

通过 `subprocess.run()` 在子进程中执行代码：

- Python → `python -c <code>`
- JavaScript → `node -e <code>`
- Shell → `bash -c <code>`

安全约束：

- 超时限制：默认 30 秒，可通过配置项调整
- 捕获 stdout 和 stderr，限制输出大小（防止内存溢出）
- 每次执行写入 ScriptExecution 审计表

后续迭代：资源访问限制（禁止网络请求、文件系统沙箱等）。

## Permission Design

复用现有 RBAC 体系，脚本相关接口注册到 `InterfaceRouter` 权限表。三组独立权限：

| Permission       | Scope                      |
| ---------------- | -------------------------- |
| `script:read`    | 查看脚本列表和详情         |
| `script:write`   | 创建、编辑、删除脚本       |
| `script:execute` | 执行脚本（独立于编辑权限） |

执行权限和编辑权限分离：允许「能编辑但不能执行」和「能执行但不能编辑」的角色配置。

## Implementation Phases

### Phase 1 — packages/editor 通用组件

- Monaco Editor 集成（v-model、语言切换、主题）
- 快捷键支持（Ctrl+S → save、Ctrl+Enter → run）
- OutputPanel 组件（stdout/stderr/状态/耗时）
- 包构建配置 + 导出

### Phase 2 — 后端 Script Domain（CRUD）

- Script 数据模型 + Alembic 迁移
- CRUD API（创建 / 列表 / 详情 / 更新 / 删除）
- 路由权限注册（script:read / script:write）
- Schemas + 分页查询

### Phase 3 — 代码执行 + 审计

- 执行 API（POST /scripts/{id}/execute）
- subprocess 沙箱执行（Python / JS / Shell）
- 超时控制
- ScriptExecution 审计模型 + 记录
- script:execute 权限控制

### Phase 4 — 前端脚本管理页面

- 脚本列表页（分页表格 + 搜索筛选）
- 编辑器页面（工具栏 + MonacoEditor + OutputPanel）
- 语言切换、保存、执行完整流程
- 路由 + 菜单 + i18n
