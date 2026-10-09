# PythonArgumentsEditor

通用 Python 参数表单组件，不依赖任务队列 API 或页面状态。

```vue
<script setup lang="ts">
  import { ref } from "vue"
  import PythonArgumentsEditor from "@/components/common/python-arguments-editor/index.vue"
  import type { PythonArguments } from "@/components/common/python-arguments-editor/arguments"

  const argumentsModel = ref<PythonArguments>({ args: [], kwargs: {} })
  const editor = ref<InstanceType<typeof PythonArgumentsEditor> | null>(null)

  function submit() {
    if (!editor.value?.validate()) return
    // 使用 argumentsModel.value.args 和 argumentsModel.value.kwargs 提交。
  }
</script>

<template>
  <PythonArgumentsEditor
    ref="editor"
    v-model="argumentsModel"
    function-name="jobs.run"
    :disabled="false"
    :show-preview="true"
  />
</template>
```

- 必填 `v-model`：`{ args: unknown[], kwargs: Record<string, unknown> }`。
- `functionName`：调用预览中的函数名，默认 `task`，仅用于展示。
- `disabled`：禁止修改参数，默认 `false`。
- `showPreview`：显示 Python / JSON 代码面板，默认 `true`。
- `validity-change`：表单合法性改变时发送布尔值，可用于禁用提交按钮。
- `validate()`：同步校验并提交当前编辑值到 model，返回布尔值，不依赖全局消息服务。

非法草稿保留在组件内部，不覆盖最后一次合法 model。外部替换 model 可重置或回填。
支持字符串、数字、布尔、None 和 JSON，整数限制在 JavaScript 安全精度范围。
关键字名称非空且不可重复。调用预览直接展开参数，每个参数独占一行；嵌套值保留缩进，无参数时显示 `test()`。
可直接用作 Python 参数名的关键字显示为 `name=value`；特殊名称、保留字及会被 Python 规范化改变的名称使用字典展开，保留原始键。
JSON 结构映射为 Python 列表、字典及字面量；不支持执行表达式、自定义对象或函数签名校验。
代码面板提供逐行语法着色、行号和复制，不解释或执行输入代码。
