# PythonArgumentsViewer

独立的只读 Python 参数展示组件，适用于任务详情等需要查看已有参数的场景。

```vue
<PythonArgumentsViewer
  :args="['monthly-report', 2026, ['sales', 'finance'], null]"
  :kwargs="{ region: 'Asia/Shanghai', dry_run: false, retry: 3 }"
  function-name="process_report"
/>
```

| 参数           | 类型                                        | 默认值 |
| -------------- | ------------------------------------------- | ------ |
| `args`         | `readonly unknown[] \| null`                | 空列表 |
| `kwargs`       | `Readonly<Record<string, unknown>> \| null` | 空对象 |
| `functionName` | `string`                                    | `task` |
| `showPreview`  | `boolean`                                   | `true` |

- 位置参数按零基索引展示，关键字参数保留原名称。每组显示参数数量和独立空状态。
- 支持 JSON 兼容的数据：字符串、有限数字、布尔、null、列表和字典；null 显示为 Python `None`。
- 值旁显示 Python 类型；数字按 JavaScript 接收到的值区分 `int` 和 `float`。
- 非空列表和字典默认收起，按层展开后才挂载子项；空列表和空字典直接显示 `[]` 和 `{}`。
- 长名称与内容自动换行；窄空间将值移至名称和类型下方；支持明暗主题。
- Python 调用预览默认折叠，复用现有代码着色、行号和复制组件。参数直接展开，每个参数独占一行，嵌套值保留缩进；无参数时显示 `test()`。特殊名称使用字典展开以保留原始键。
- 仅展示数据，不执行内容、不修改输入，不发出编辑事件。Python repr 字符串应由调用方转换为结构化数据后使用。
