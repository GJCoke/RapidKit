# Unified schedule API

创建、更新、详情和列表统一采用一个 `schedule` 对象。旧 `taskType`、`scheduleId`、`interval`、`crontab` 字段不再作为管理接口契约；创建、更新请求的旧字段会返回 422。

```json
{
  "name": "morning-task",
  "task": "registered_task",
  "args": [],
  "kwargs": {},
  "schedule": {
    "type": "solar",
    "event": "sunrise",
    "latitude": 31.2304,
    "longitude": 121.4737
  }
}
```

| `type`     | 配置字段                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| `interval` | `every`（正整数）、`period`（seconds/minutes/hours/days/weeks/milliseconds/microseconds） |
| `crontab`  | `minute/hour/dayOfMonth/monthOfYear/dayOfWeek`，五个字符串，默认 `*`                      |
| `solar`    | `event`（Celery 九事件）、`latitude`（−90～90）、`longitude`（−180～180）                 |

`PUT /api/v1/schedules/{id}` 是局部更新：省略字段则保留，显式 `null` 被拒绝。传入另一种 `schedule.type` 会在当前请求事务内新建配置、切换关联并删除原配置；未传的任务参数保留。同类型原地更新。切换和删除使用任务行锁。

`POST /api/v1/schedules/preview` 接收 `{"schedule": {...}}`，返回 `valid/errorField/timezone/evaluatedAt/nextRuns/horizonYears`，无数据库或 broker 依赖。最多返回五年内五次事件。时间采用带时区 ISO 8601，间隔微秒精度保留。非法 Cron 语法在预览中返回 `valid=false`，保存时返回 422；合法但无匹配日期的 Cron 返回空列表。旧独立 Cron 预览端点暂保留给公共组件调用方。

Solar 依赖已加入插件 `pyproject.toml` 和 `uv.lock`：`ephem>=4.2,<5`。部署时同步依赖并重启 API、Beat。Beat 极地重查时间不会作为实际事件投递，阳光恢复后可继续运行。

数据库迁移：`d83e41a926c0` 接续 `baefb869cf5b`，将 Solar 坐标从 Integer 改为 Float，不改变任务表和关联 ID。回退时若已有小数坐标，会拒绝有损转换。

正常数据库用 `pnpm rapidkit db upgrade --plugin schedule`。本地库存在旧修订 `826038026163`（仓库无该文件），CLI 自动生成因此失败。本次已通过同一迁移的 `Operations` 在本地事务中单独升级坐标两列并记录新版本，核对任务数据、表和旧版本记录均保留；旧迁移链问题仍需独立处理，未重置或伪造旧版本文件。
