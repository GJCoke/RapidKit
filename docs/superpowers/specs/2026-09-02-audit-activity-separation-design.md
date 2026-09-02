# 审计日志与活动动态分离设计

## 背景

首页“活动动态”当前直接读取 `system_activity_logs`。这张表同时接收 HTTP 审计中间件生成的请求记录和 EventBus 通配监听器生成的领域事件，前端再根据 `event_type` 的 `resource.action` 结构查询审计字典并拼接文案。

该设计导致三个直接问题：

- `/auth/refreshToken` 等内部写请求会被推断为 `refreshToken.create`，并显示成业务动态。
- 登录等操作可能同时被 HTTP 中间件和领域事件记录，产生重复数据。
- 前端机械拼接“操作人 + 动作 + 资源 + 目标”，产生“登录了用户”等不自然或错误的文案。

本次重构将审计日志和活动动态拆成两个独立模块。审计日志服务于安全追踪和故障排查；活动动态服务于首页的信息感知，不再暴露底层认证与 HTTP 实现细节。

## 目标

- 活动动态固定分为任务、用户、系统、告警四类。
- Refresh Token、心跳、监控上报等内部动作不进入活动动态。
- 业务动态由明确注册的领域事件生成，不从 URL 或 HTTP 方法猜测业务语义。
- 审计日志完整表达“谁、对什么、做了什么、结果如何”。
- 消除同一业务操作的重复动态。
- 支持活动分类筛选、游标分页和权限受控的实时推送。
- 保证 Token、密码、验证码等敏感信息不会进入活动数据或审计查询响应。

## 非目标

- 本次不建设可视化告警规则编辑器。
- 本次不对旧活动日志进行有损的业务事件推断。
- 本次不大规模改版审计管理页面，只完成新模型所需的查询适配。
- 本次不把活动动态作为可靠的合规审计来源。

## 方案选择

采用审计日志和活动动态彻底拆表的方案。

未采用的方案：

- 单表增加 `visible_in_activity` 和 `category`：改动较小，但两个概念仍强耦合，数据污染风险长期存在。
- 查询时实时聚合审计、任务和监控数据：无需新活动表，但查询复杂，性能、分页和文案一致性较差。

## 总体架构

```text
HTTP 请求
   ↓
AuditMiddleware
   ↓
system_audit_logs
   └─ 面向管理员、安全审计和故障排查

业务模块
   ↓
Domain Event
   ├─ AuditEventHandler → system_audit_logs（仅关键业务事件）
   └─ ActivityProjector → system_activity_events
                              └─ 首页四类活动动态
```

核心约束：

- 两个模块使用不同模型、表、Schema、API 和前端类型。
- 删除当前 EventBus 通配写入活动日志的行为。
- 活动投影采用显式白名单，没有映射的领域事件不会展示。
- HTTP 审计中间件只生成技术审计记录，不生成用户可见动态。
- 审计记录和活动记录可通过 `request_id` 或 `correlation_id` 关联，但互不依赖。

## 活动动态模型

新建 `system_activity_events`，主要字段如下：

| 字段 | 用途 |
| --- | --- |
| `id` | UUID7 主键 |
| `category` | `task`、`user`、`system`、`alert` |
| `event_code` | 稳定事件编码，如 `task.succeeded` |
| `level` | `info`、`success`、`warning`、`error` |
| `actor_id` / `actor_name` | 可选操作人快照 |
| `subject_type` / `subject_id` / `subject_name` | 事件主体快照 |
| `title_key` / `title_params` | 标题国际化键及参数 |
| `description_key` / `description_params` | 可选描述国际化键及参数 |
| `metadata` | 路由、耗时等非核心扩展数据 |
| `source_event_id` | 领域事件唯一标识，用于幂等 |
| `occurred_at` | 事件实际发生时间 |
| `create_time` | 记录写入时间 |

`source_event_id` 建立唯一约束。活动表禁止保存请求体、Token、IP 和 User-Agent 等技术信息。

### 分类与首批事件

| 分类 | 首批事件 |
| --- | --- |
| 任务 | `task.started`、`task.succeeded`、`task.failed`、`task.cancelled`、`schedule.created`、`schedule.enabled`、`schedule.disabled` |
| 用户 | `user.login`、`user.logout`、`user.created`、`user.disabled`、`user.roles_changed`、`user.password_changed` |
| 系统 | `system.started`、`system.config_changed`、`plugin.enabled`、`plugin.disabled`、`worker.online`、`worker.offline` |
| 告警 | `alert.service_unavailable`、`alert.resource_threshold`、`alert.task_repeated_failure`、`alert.plugin_load_failed`、`alert.worker_lost` |

单次任务失败仍属于“任务”。只有达到明确告警策略阈值后，才额外生成一条“告警”事件。第一版阈值使用代码或配置定义。

## 审计日志模型

新建 `system_audit_logs`，表达可检索的结构化审计语义：

| 字段组 | 字段 |
| --- | --- |
| 操作人 | `actor_id`、`actor_name` |
| 行为 | `action`、`result`、`risk_level`、`source` |
| 资源 | `resource_type`、`resource_id`、`resource_name` |
| 请求关联 | `request_id`、`correlation_id`、`http_method`、`path` |
| 来源环境 | `ip`、`user_agent` |
| 诊断信息 | 脱敏请求摘要、应用响应码、错误信息、扩展元数据 |
| 时间 | `occurred_at`、`create_time` |

审计结果使用 `success` 和 `failure`，风险等级使用 `normal`、`sensitive` 和 `critical`。列表 API 不返回请求摘要和错误详情；详情 API 需要独立权限。

### 审计采集规则

- HTTP 中间件记录关键写操作及需要追踪的失败请求。
- 登录、退出等认证操作使用显式审计动作，例如 `auth.login`。
- Refresh Token 默认从普通审计中排除；未来若安全分析需要记录，只能使用 `auth.token_refresh` 技术动作，且永不投影到活动动态。
- 心跳、监控上报、Socket.IO、健康检查和文档接口默认排除。
- 重要业务接口显式声明审计语义；未声明接口只能生成通用技术记录，不能猜测自然语言业务含义。
- 响应体默认不落库。

## 事件契约与投影

可生成活动动态的领域事件必须包含：

- 唯一 `event_id`
- `occurred_at`
- 可选 `correlation_id`
- 事件所需的主体、操作人和展示参数

`ActivityProjector` 为具体事件类型注册映射函数，例如：

```text
TaskSucceededEvent → task / success / activity.task.succeeded
UserLoginEvent     → user / info / activity.user.login
WorkerOfflineEvent → system / warning / activity.system.worker_offline
PluginLoadFailed   → alert / error / activity.alert.plugin_load_failed
```

映射函数生成稳定的 `title_key` 和结构化 `title_params`，不生成固定语言句子。前端使用国际化资源渲染，例如：

```json
{
  "titleKey": "activity.task.succeeded",
  "titleParams": {
    "task": "每日数据同步",
    "duration": "12.4 秒"
  }
}
```

中文显示为“任务「每日数据同步」执行成功，耗时 12.4 秒”。英文使用同一参数和对应语言模板。

## 一致性、幂等与失败处理

- `source_event_id` 唯一约束提供最终幂等保证。
- 活动投影失败不能回滚主营业务事务。
- 投影失败写入结构化日志或 EventBus 死信，并保留 `event_id` 以便重放。
- 活动记录成功落库后才发送 Socket.IO 通知。
- Socket.IO 推送失败不删除或回滚活动记录。
- 同一个请求可以产生多个合法业务事件，因此不能仅凭 `request_id` 去重。
- 登录动态只由 `UserLoginEvent` 投影，HTTP 中间件不生成活动，因此不会重复。
- 缺少告警来源、告警状态等必要字段的告警事件不得写入活动表。

## API 设计

### 活动动态

```http
GET /api/v1/system/activities
```

查询参数：

- `categories`：可选，多值，限定 `task,user,system,alert`
- `levels`：可选，多值，限定 `info,success,warning,error`
- `cursor`：可选游标
- `size`：默认 20，并设置合理上限

响应包含 `items` 和 `nextCursor`。游标以 `occurred_at + id` 构造稳定排序，避免新动态插入导致传统页码分页重复或遗漏。

活动项返回分类、等级、事件编码、操作人、主体、文案键、文案参数、受控元数据和发生时间。服务端只允许输出经过验证的内部路由，不接受任意外部 URL。

### 审计日志

```http
GET /api/v1/system/audit-logs/paginate
GET /api/v1/system/audit-logs/{id}
```

分页查询支持操作人、动作、资源类型、结果、风险等级、IP 和时间范围。详情端点使用单独权限，并始终执行字段级脱敏。

## 实时推送与权限

活动成功落库后推送 `dashboard:activity.created`。前端按活动 `id` 去重并插入当前列表顶部。

- 查询活动需要 `dashboard.activity` 权限。
- Socket.IO 订阅必须执行同等权限校验，不能只依赖前端隐藏。
- 审计列表和审计详情使用独立权限。
- 无权限连接不得接收活动载荷。

## 前端设计

首页活动模块顶部提供：

```text
[全部] [任务] [用户] [系统] [告警]
```

默认选择“全部”。切换分类时重新请求服务端，不能只过滤固定数量的已加载记录。

每条活动包括分类图标、分类标签、自然语言标题、可选描述和相对时间。存在经后端验证的内部路由时允许点击进入详情。

推荐图标和基础色：

| 分类 | 图标语义 | 基础色 |
| --- | --- | --- |
| 任务 | task | 蓝色 |
| 用户 | user | 青绿色 |
| 系统 | settings | 灰蓝色 |
| 告警 | warning | 橙色或红色 |

严重等级颜色优先于分类颜色，分类主要通过图标和标签区分。

前端删除以下旧逻辑：

- 拆分 `eventType` 并猜测 resource/action。
- 加载审计字典生成活动文案。
- 拼接 operator、action、resource 和 target。
- 根据 `.create`、`.update`、`.delete` 猜测时间线颜色。

前端只根据 `titleKey + titleParams` 渲染文案，根据 `category + level` 渲染视觉状态。未知 `titleKey` 使用安全兜底文案并显示事件编码，不能恢复旧的机械拼接。

## 审计字典退役

现有审计字典不再参与活动动态。动作名称和活动文案属于代码契约，应使用受版本控制的国际化资源，不允许通过运行时数据库任意改变语义。

实施时先检查其他模块依赖；若无其他依赖，在兼容期结束后删除：

- `system_audit_dictionaries`
- 审计字典 CRUD 和 API
- 前端审计字典管理页
- 对应菜单、权限和初始化数据

若发现其他依赖，则先标记弃用并保留兼容读取，后续单独清理。

## 历史数据策略

旧 `system_activity_logs` 中的业务语义来源不可靠，不全量转换成新活动事件。

迁移步骤：

1. 将旧表重命名或迁移为 `system_audit_logs_legacy`。
2. 新审计表和活动表从上线时开始写入。
3. 审计查询页面提供历史日志兼容入口或只读查询。
4. 根据配置的保留期归档或删除旧数据。
5. 旧数据永不混入新活动动态。

任何实际删除必须在实施计划中明确保留期和恢复方式，不能在结构迁移时直接销毁历史记录。

## 安全要求

- Authorization、Cookie、Token、密码、密钥和验证码永不落库。
- 敏感字段应从结构中移除，而不只是替换为可见占位符。
- 请求摘要限制字节数、嵌套深度和字段数量。
- 响应体默认不保存。
- 活动 `metadata` 采用事件级白名单，不透传任意业务对象。
- 审计详情响应在持久化脱敏基础上再次执行输出脱敏。
- 审计和活动数据分别配置保留策略。

## 测试与验收标准

### 后端

- 登录成功只生成一条用户类活动。
- Refresh Token 不生成活动，默认不生成普通操作审计。
- 任务成功和失败均属于任务类。
- 连续失败达到阈值后额外生成一条告警类活动。
- 同一 `event_id` 重复消费只保存一次。
- 活动投影或实时推送失败不影响主营业务提交。
- 游标分页在并发插入时不重复、不漏读既有游标范围内数据。
- 活动和审计查询均执行权限校验。
- Token、密码、验证码和密钥不出现在数据库或 API 响应中。

### 前端

- 全部、任务、用户、系统和告警筛选正确请求并展示数据。
- 中英文文案均正确替换参数。
- 分类图标、标签和等级状态一致。
- 实时活动按 ID 去重。
- 未知文案键使用安全兜底，不产生机械拼接文案。
- Refresh Token 和旧历史脏数据不出现在首页。

## 实施边界与顺序

本次实施包括：

1. 新审计表、活动表及非破坏性迁移。
2. 审计中间件采集规则重构。
3. 显式活动事件投影器和首批四类事件接入。
4. 新活动查询 API、游标分页和权限受控实时推送。
5. 首页活动模块和国际化文案重构。
6. 审计查询 API 与现有管理页面的必要适配。
7. 审计字典依赖检查及可安全完成的退役工作。
8. 后端、前端和迁移测试。

复杂告警策略、告警确认/关闭流程及独立告警中心留待后续设计。
