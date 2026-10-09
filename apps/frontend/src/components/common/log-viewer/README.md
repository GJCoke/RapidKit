# LogViewer

公共日志阅读组件。父组件负责获取/追加日志；LogViewer 不创建网络连接，不修改源数据。

## 纯文本

```vue
<script setup lang="ts">
  import { ref } from "vue"
  import LogViewer from "@/components/common/log-viewer/index.vue"

  const output = ref("任务开始\n连接成功\n")
</script>

<template>
  <LogViewer :log="output" :height="360" filename="task.log" />
</template>
```

## 结构化日志与受控跟随

```vue
<script setup lang="ts">
  import { ref } from "vue"
  import LogViewer from "@/components/common/log-viewer/index.vue"
  import type { LogRecord } from "@/components/common/log-viewer/types"

  const records = ref<LogRecord[]>([])
  const taskId = ref("task-001")
  const follow = ref(true)
  const wrap = ref(true)

  function append(record: LogRecord) {
    records.value.push(record)
  }

  append({ id: 1, timestamp: "14:32:01.024", level: "INFO", message: "开始执行" })
  append({ id: 2, level: "ERROR", message: "连接失败\n  at execute()" })
</script>

<template>
  <LogViewer v-model:follow="follow" v-model:wrap="wrap" :records="records" :source-key="taskId" :max-entries="5000" />
</template>
```

## 接口

| 属性              | 默认         | 说明                                                                    |
| ----------------- | ------------ | ----------------------------------------------------------------------- |
| `log`             | 空字符串     | 纯文本，保留内部空行与缩进，支持 CRLF                                   |
| `records`         | 未传入       | `{ id, message, timestamp?, level? }[]`；传入时优先于 log，空数组也优先 |
| `sourceKey`       | 未传入       | 切换日志源时改变，重置跟随和新增计数；同 ID 的不同任务尤其需要          |
| `title`           | 国际化“日志” | 标题                                                                    |
| `height`          | 360          | 正整数，日志区高度，单位 px                                             |
| `maxEntries`      | 5000         | 正整数，最近记录的展示上限；多行记录不拆分截断                          |
| `loading`         | false        | 初始加载或保留已有内容的追加加载提示                                    |
| `error`           | 未传入       | 错误文字，已有日志仍可读                                                |
| `filename`        | logs.log     | 导出文件名；移除路径分隔符、控制字符和非法文件名字符                    |
| `follow`          | true         | 支持 `v-model:follow`，向上滚动暂停，接近底部恢复                       |
| `wrap`            | true         | 支持 `v-model:wrap`，关闭时横向滚动                                     |
| `showLineNumbers` | true         | 支持 `v-model:show-line-numbers`，过滤后保留输入序号                    |

暴露 `scrollToTop()`（暂停跟随）与 `scrollToBottom()`（恢复跟随）。插槽：`title`、`toolbar-extra`。

级别支持 `DEBUG`、`INFO`、`WARN`、`ERROR`；纯文本不推断级别、不显示级别选择器。无级别记录只在“全部级别”下显示。时间原样显示，不转换时区、不排序。

搜索为不区分大小写的字面过滤，范围包括展示的时间、级别、消息，不支持正则或高亮。复制与导出仅包含当前筛选且容量限制后的日志，保留堆栈缩进，不包含装饰性行号。导出为 UTF-8 `.log` 文本。复制需要浏览器可用的 Clipboard API；失败时展示反馈。

暂停跟随不暂停数据接收。新增提示统计当前筛选条件下的新增记录；扩展纯文本末尾未完成的行不增加记录数。清空/替换日志、改变 sourceKey 会恢复跟随并清零提示。仅追加保持已有结构化记录的唯一稳定 ID 和内容；若复用 ID 改写旧记录，按替换数据源处理。相同长度滚动窗口若保留连续旧记录，也识别为追加。

## 渲染与性能

正文使用 Naive UI 的 **NScrollbar + Vue 转义文本节点**。当前 NLog 没有公开逐行渲染插槽，无法直接满足级别着色和行号；组件不依赖 NLog 内部 DOM，也不向日志注入 HTML。

maxEntries 限制展示记录数，**不是虚拟列表，也不会替父组件释放源数据**。接入方应限制源数组和单条消息大小。源数组自行轮转时，序号/省略量以本次输入为准，不表示服务端累计量。暂停期间尽量保持仍保留的阅读记录位置，阅读记录被淘汰时显示容量提示。
