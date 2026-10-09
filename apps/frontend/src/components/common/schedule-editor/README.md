# ScheduleEditor

三个独立公共组件由 `ScheduleEditor` 整合：

| 组件                           | 模型            | 功能                                 |
| ------------------------------ | --------------- | ------------------------------------ |
| `../interval-editor/index.vue` | `IntervalValue` | 正整数数量、七种时间单位、常用间隔   |
| `../crontab-editor/index.vue`  | `CrontabValue`  | 六种日历模式、原样保留高级表达式     |
| `../solar-editor/index.vue`    | `SolarValue`    | 九种天文事件、小数经纬度、半球提示   |
| `index.vue`                    | `ScheduleValue` | 类型切换、保留各类草稿、校验当前组件 |

四个组件均接受必填 `v-model` 与 `loadPreview`、可选 `disabled`，触发 `validity-change(boolean)`，暴露异步 `validate()` 和 `refresh()`。独立组件的适配器接收自身配置；整合组件的适配器接收 `{type, ...config}`。

```vue
<script setup lang="ts">
  import { ref } from "vue"
  import ScheduleEditor from "@/components/common/schedule-editor/index.vue"
  import { defaultSchedule, isCompleteSchedule } from "@/components/common/schedule-editor/schedule"
  import type { ScheduleValue } from "@/components/common/schedule-editor/schedule"
  import { fetchGetSchedulePreview } from "@/service/api/worker"

  const schedule = ref<ScheduleValue>(defaultSchedule("interval"))
  const editor = ref<InstanceType<typeof ScheduleEditor> | null>(null)
  async function loadPreview(value: ScheduleValue) {
    if (!isCompleteSchedule(value)) return null
    const { data, error } = await fetchGetSchedulePreview({ schedule: value })
    return error || !data ? null : { ...data, nextRuns: data.nextRuns ?? [] }
  }
  async function submit() {
    if (!(await editor.value?.validate()) || !isCompleteSchedule(schedule.value)) return
    // 此时再将 schedule.value 交给创建/更新接口。
  }
</script>

<template>
  <ScheduleEditor ref="editor" v-model="schedule" :load-preview="loadPreview" />
</template>
```

公共组件不依赖业务 API。适配器失败时返回 `null` 或抛出异常；组件会保留输入、显示重试提示并阻止提交。输入变更会立即作废旧预览，300ms 防抖请求；`validate()` 无需等待防抖，且不会接受编辑或切换类型之前的响应。

`IntervalValue.every` 和 `SolarValue.latitude/longitude` 允许 `null` 表示清空输入。业务提交前调用 `validate()` 与 `isCompleteSchedule()`。不要把缺失坐标隐式替换为零。

类型切换保留输入，包括尚未通过校验的高级 Cron 草稿。由调用方替换整个模型对象时开启新的编辑会话并清空其他类型的旧草稿；适合编辑抽屉切换记录。程序调用 `validate()` 时若模型发生变化会返回 `false`。

三类组件统一展示未来五次计划执行、时区和计算基准。微秒/毫秒间隔保留时间精度；其他类型按秒显示，完整 ISO 时间保留在 `<time datetime>` 与悬浮提示。Solar 在窄屏以单列显示坐标。

固定间隔从上次 Beat 投递时间计时，首次加载从 Beat 启动计时，不等待任务完成。本组件的间隔预览以预览时刻为示例起点。Cron 按日历对齐；Solar 使用 Celery 的事件定义及 PyEphem 计算，跳过极地无事件日。未来时间是计划时间，不代表 Worker 实际开始执行时间。
