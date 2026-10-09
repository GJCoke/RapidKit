# JsonViewer

公共只读 JSON 展示组件，适用于接口响应、任务返回值和配置预览。

```vue
<script setup lang="ts">
  import { ref } from "vue"
  import JsonViewer from "@/components/common/json-viewer/index.vue"
  const result = ref({ ok: false, count: 0, items: ["", null] })
</script>

<template>
  <JsonViewer :value="result" title="返回值" filename="task-result.json" :max-height="360" />
</template>
```

| 参数              | 默认      | 说明                                                      |
| ----------------- | --------- | --------------------------------------------------------- |
| `value`           | 必传      | 原始 JSON 值，支持对象、数组、字符串、数值、布尔值和 null |
| `title`           | JSON 数据 | 标题，可用 title 插槽替换                                 |
| `filename`        | data.json | 下载文件名，自动去掉路径和非法字符                        |
| `maxHeight`       | 360       | 内容区最大高度，正整数，单位 px；短内容按实际高度展示     |
| `wrap`            | true      | 支持 v-model:wrap；关闭后支持横向滚动                     |
| `showLineNumbers` | true      | 支持 v-model:show-line-numbers                            |

使用两空格缩进和安全文本节点着色，适配 Naive UI 亮暗主题。字符串保持原类型，JSON-looking 字符串不会被自动解析。null 显示为 JSON null；undefined 显示暂无数据。Date 等非普通对象、自定义 toJSON、循环引用、BigInt、函数、Symbol、undefined 字段和非有限数值不静默转换，显示不能完整序列化的错误并禁用操作。

复制和下载使用与展示一致的完整 JSON 文本，不包含行号。下载 MIME 为 application/json;charset=utf-8；复制使用 Clipboard API，权限或环境不支持时给出失败反馈。

组件使用 NScrollbar，支持键盘焦点、换行和行号控制。高度限制只控制视口，**没有虚拟化或数据截断**，接入方应限制过大数据。语法着色与 Python 参数预览共用 `@/utils/code-tokens`，文本操作与 LogViewer 共用 `@/utils/text-actions`。
