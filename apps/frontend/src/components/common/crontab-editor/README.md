# CrontabEditor

公共 Celery Crontab 编辑组件，支持六种模式、五字段表达式、计划执行预览。

```vue
<CrontabEditor ref="cronRef" v-model="crontab" :load-preview="loadPreview" />
```

- `v-model: CrontabValue`：`minute / hour / dayOfMonth / monthOfYear / dayOfWeek` 五个字符串。
- `loadPreview: (value) => Promise<CrontabPreview | null>`：必填，由调用方注入权威校验与预览。返回 `null` 或抛出异常表示请求失败。
- `disabled?: boolean`：禁用编辑。
- `validity-change(valid)`：供调用方监听当前预览状态。
- `await cronRef.validate()`：提交前必调。会校验当前草稿并等待最新预览；无效草稿、预览失败或请求期间再次编辑均返回 `false`。
- `await cronRef.refresh()`：重新计算预览。

已有表达式原样加载；仅精确匹配常用模式的规则才进入可视化模式。星期采用 Celery 的 `0–6`（周日为 `0`），日期、月份与星期须同时匹配。每 N 分钟从整点对齐，固定间隔应使用 Interval 调度。

组件不直接依赖 API。ScheduleEditor 的适配器使用统一 `/schedules/preview`；独立调用方亦可使用 `/schedules/crontab/preview`，未来五次计划执行时间来自 Celery 的解析与时间计算，并显示后端配置时区。预览上限为五年；无有效日期的合法表达式显示空预览，真实执行还受 Beat 和 Worker 状态影响。
