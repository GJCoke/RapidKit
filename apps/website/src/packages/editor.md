# @rapidkit/editor

基于 Monaco Editor 的 Vue 3 组件库,提供代码编辑器和输出面板两个组件,适用于在线代码编辑与执行场景。

## 安装与引用

```jsonc
// package.json
{
  "dependencies": {
    "@rapidkit/editor": "workspace:*",
  },
  "peerDependencies": {
    "vue": ">=3.0.0",
  },
}
```

```ts
import { MonacoEditor, OutputPanel } from "@rapidkit/editor"
import type { MonacoEditorProps, OutputPanelProps, OutputStatus } from "@rapidkit/editor"
```

## 依赖关系

| 依赖            | 用途           |
| --------------- | -------------- |
| `monaco-editor` | 底层编辑器引擎 |
| `vue` (peer)    | Vue 3 运行时   |

构建方式为 Vue SFC 模式,仅输出 ESM 格式。

## 组件列表

### MonacoEditor

功能完整的代码编辑器组件,支持 v-model 双向绑定、多语言、明暗主题切换。

#### Props

| 属性         | 类型                | 默认值      | 说明                      |
| ------------ | ------------------- | ----------- | ------------------------- |
| `modelValue` | `string`            | `""`        | 编辑器内容,支持 `v-model` |
| `language`   | `string`            | `"python"`  | 语言模式                  |
| `theme`      | `"vs" \| "vs-dark"` | `"vs-dark"` | 明暗主题                  |
| `readOnly`   | `boolean`           | `false`     | 是否只读                  |
| `minimap`    | `boolean`           | `true`      | 是否显示缩略图            |
| `height`     | `string`            | `"100%"`    | 编辑器高度                |

#### Events

| 事件                | 参数            | 说明                         |
| ------------------- | --------------- | ---------------------------- |
| `update:modelValue` | `value: string` | 内容变化时触发               |
| `save`              | --              | 用户按下 `Ctrl+S` 时触发     |
| `run`               | --              | 用户按下 `Ctrl+Enter` 时触发 |

#### 内置特性

- 自定义明暗两套编辑器配色主题(`editor-dark` / `editor-light`)
- 括号配对着色、平滑光标动画、连字渲染
- `ResizeObserver` 自动布局适配,无需手动调用 `editor.layout()`
- 组件卸载时自动销毁编辑器实例

#### 使用示例

```vue
<template>
  <MonacoEditor v-model="code" language="python" theme="vs-dark" height="400px" @save="handleSave" @run="handleRun" />
</template>

<script setup lang="ts">
  import { ref } from "vue"
  import { MonacoEditor } from "@rapidkit/editor"

  const code = ref('print("Hello, World!")')
  const handleSave = () => {
    /* 保存逻辑 */
  }
  const handleRun = () => {
    /* 执行逻辑 */
  }
</script>
```

### OutputPanel

代码执行结果展示面板,支持状态指示(空闲、运行中、成功、失败)和运行耗时显示。

#### Props

| 属性      | 类型                | 默认值      | 说明                                               |
| --------- | ------------------- | ----------- | -------------------------------------------------- |
| `output`  | `string`            | `""`        | 标准输出内容                                       |
| `error`   | `string \| null`    | `null`      | 错误输出内容                                       |
| `status`  | `OutputStatus`      | `"idle"`    | 执行状态: `idle` / `running` / `success` / `error` |
| `runtime` | `number \| null`    | `null`      | 执行耗时(秒)                                       |
| `theme`   | `"vs" \| "vs-dark"` | `"vs-dark"` | 明暗主题                                           |

#### 使用示例

```vue
<template>
  <OutputPanel :output="result" :error="errorMsg" :status="status" :runtime="elapsed" theme="vs-dark" />
</template>
```

::: tip
`MonacoEditor` 和 `OutputPanel` 可组合使用,搭建完整的在线代码编辑与执行界面。`MonacoEditor` 的 `run` 事件可直接触发代码提交,结果展示在
`OutputPanel` 中。
:::
