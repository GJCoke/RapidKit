# 定时任务调度

定时任务调度作为独立插件 `plugin_schedule` 实现，通过 Celery Beat 将任务配置持久化到 PostgreSQL 数据库，并提供完整的 CRUD API 进行管理。

:::info 条件加载
`plugin_schedule` 和 `plugin_worker` 仅在环境变量 `ENABLE_CELERY_MONITOR=true` 时注册。未启用时，相关路由和模型不会加载。
:::

## 架构概览

定时任务系统由以下部分组成：

- **调度模型**：定义 Interval、Crontab、Solar 三种调度类型
- **PeriodicTask 模型**：定时任务的数据库持久化
- **AsyncDatabaseScheduler**：从 PostgreSQL 读取任务配置的自定义调度器
- **REST API**：通过 HTTP 接口管理定时任务的完整生命周期

插件源码位于 `apps/backend/plugins/schedule/`，迁移文件在 `plugins/schedule/migrations/versions/`。

## 调度类型

### IntervalSchedule

基于固定时间间隔的调度，使用 `timedelta` 参数：

```python
class IntervalSchedule(BaseSchedule):
    every: int
    period: Period  # weeks, days, hours, minutes, seconds 等

    @property
    def schedule(self) -> Schedule:
        return Schedule(timedelta(**{self.period.value: self.every}))
```

### CrontabSchedule

基于 Cron 表达式的调度，支持 5 个时间字段：

```python
class CrontabSchedule(BaseSchedule):
    minute: str = "*"
    hour: str = "*"
    day_of_week: str = "*"
    day_of_month: str = "*"
    month_of_year: str = "*"

    @property
    def schedule(self) -> Crontab:
        return Crontab(
            minute=self.minute, hour=self.hour,
            day_of_week=self.day_of_week,
            day_of_month=self.day_of_month,
            month_of_year=self.month_of_year,
        )
```

### SolarSchedule

基于天文事件的调度（日出、日落等），需要提供经纬度：

```python
class SolarSchedule(BaseSchedule):
    event: SolarEvent  # sunrise, sunset, dawn_civil 等
    latitude: int
    longitude: int

    @property
    def schedule(self) -> Solar:
        return Solar(event=self.event.value, lat=self.latitude, lon=self.longitude)
```

`TaskType` 枚举统一管理三种调度类型与其对应的模型类：

```python
class TaskType(Enum):
    INTERVAL = ("interval", IntervalSchedule)
    CRONTAB = ("crontab", CrontabSchedule)
    SOLAR = ("solar", SolarSchedule)
```

## PeriodicTask 模型

定时任务模型包含任务执行所需的完整配置：

```python
class PeriodicTask(SQLModel, table=True):
    __tablename__ = "celery_periodic_task"

    name: str
    enabled: bool = True
    task: str              # Celery 注册的任务名称
    task_type: TaskType
    schedule_id: UUID      # 关联的调度配置 ID
    args: list[Any] = Field([], sa_column=Column(JSON))
    kwargs: dict[str, Any] = Field({}, sa_column=Column(JSON))
    options: Options | None = Field(None, sa_column=Column(JSON))
```

:::info
`args`、`kwargs` 和 `options` 使用 JSON 列存储，`Options` 包括 `queue`、`priority`、`retry`、`expires` 和 `retry_policy` 等 Celery 任务选项。
:::

## AsyncDatabaseScheduler

自定义的 Celery Beat 调度器，从 PostgreSQL 异步读取任务配置：

```python
class AsyncDatabaseScheduler(Scheduler):
    def __init__(self, app: Celery, **kwargs):
        database_url = app.conf.get("database_url")
        self._loop = asyncio.new_event_loop()
        async_engine = create_async_engine(database_url)
        self.AsyncSessionLocal = async_sessionmaker(
            async_engine, class_=AsyncSession, expire_on_commit=False,
        )
        super().__init__(app, **kwargs)
```

调度器通过 `get_database_schedule` 方法查询所有已启用的任务，并构建调度条目：

```python
async def get_database_schedule(self) -> dict[str, ScheduleEntry]:
    async with self.AsyncSessionLocal() as session:
        _tasks = await session.exec(
            select(PeriodicTask).filter(col(PeriodicTask.enabled).is_(True))
        )
        tasks = _tasks.all()
        celery_beat = {}
        for task in tasks:
            schedule_model = _SCHEDULE_MODEL_MAP.get(task.task_type)
            _schedule_info = await session.exec(
                select(schedule_model).filter(col(schedule_model.id) == task.schedule_id)
            )
            schedule_info = _schedule_info.first()
            if schedule_info:
                celery_beat[task.name] = ScheduleEntry(
                    name=task.name, task=task.task,
                    schedule=schedule_info.schedule,
                    args=task.args, kwargs=task.kwargs,
                    options=task.options,
                )
        return celery_beat
```

调度器在每次 `tick` 时检查是否需要刷新，间隔通过 `refresh_interval` 配置：

```python
def tick(self, *args, **kwargs) -> float:
    now = datetime.now(UTC)
    if self.refresh_interval and (now - self.last_updated) > timedelta(seconds=self.refresh_interval):
        self.setup_schedule()
        self.last_updated = now
    return super().tick(*args, **kwargs)
```

:::tip
`refresh_interval` 控制调度器从数据库重新加载任务的频率。通过 API 修改任务配置后，最多等待该间隔时间即可生效，无需重启 Beat 进程。
:::

## API 接口

定时任务提供完整的 RESTful API，所有接口需要权限验证：

| 方法     | 路径                            | 说明                         |
| -------- | ------------------------------- | ---------------------------- |
| `GET`    | `/api/v1/schedules`             | 分页查询定时任务列表         |
| `GET`    | `/api/v1/schedules/{id}`        | 获取单个任务详情             |
| `POST`   | `/api/v1/schedules`             | 创建定时任务                 |
| `PUT`    | `/api/v1/schedules/{id}`        | 更新定时任务                 |
| `PATCH`  | `/api/v1/schedules/{id}/toggle` | 启用/禁用任务                |
| `DELETE` | `/api/v1/schedules/{id}`        | 删除任务（级联删除调度记录） |

创建任务时，根据 `task_type` 自动创建对应的调度记录：

```python
@router.post("")
async def create_schedule(body: PeriodicTaskCreate, crud: PeriodicTaskCrudDep):
    if body.task_type == TaskType.INTERVAL:
        schedule = await crud.interval_crud.create(body.interval)
    elif body.task_type == TaskType.CRONTAB:
        schedule = await crud.crontab_crud.create(body.crontab)

    task_data = body.model_dump(exclude={"interval", "crontab"})
    task_data["schedule_id"] = schedule.id
    task = await crud.create(task_data)
    return Response(data=await crud.get_with_schedule(task.id))
```

:::warning
`ENABLE_CELERY_MONITOR` 环境变量控制是否注册 Schedule 相关路由。当设置为 `False` 时，定时任务 API 不可用。
:::

## 启动 Beat 进程

使用自定义调度器启动 Celery Beat：

```bash
celery -A src.queues.app beat --scheduler src.queues.scheduler:AsyncDatabaseScheduler
```

Beat 进程启动后会立即从数据库加载所有已启用的任务，并按照各自的调度配置定时触发执行。
