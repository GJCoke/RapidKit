# 日志系统

本项目使用 Loguru 作为统一的日志后端，通过 `InterceptHandler` 桥接标准库 `logging`，实现控制台格式化输出和文件自动轮转。

## 架构概览

日志系统由以下组件构成：

- **Loguru**：替代标准库 `logging`，作为唯一的日志后端
- **InterceptHandler**：拦截标准库日志（如 uvicorn、sqlalchemy），统一转发到 Loguru
- **ContextMiddleware + NanoIdPlugin**：为每个请求生成唯一的 Nano ID，用于日志追踪
- **文件日志**：按级别分离的双文件输出，自动轮转和清理

## InterceptHandler

`InterceptHandler` 继承自 `logging.Handler`，将所有标准库的日志记录重定向到 Loguru：

```python
class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = ruLogger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        ruLogger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())
```

:::info
通过栈帧遍历计算正确的调用深度，确保 Loguru 输出的文件名和行号指向实际产生日志的代码位置，而非 `InterceptHandler` 本身。
:::

## 控制台输出格式

控制台日志格式通过 `LOG_FORMAT` 环境变量配置，默认格式为：

```
<timestamp> | <level> | <nanoid> | <message>
```

对应的配置值：

```python
LOG_FORMAT: str = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</> "
    "| <lvl>{level: <8}</> "
    "| <cyan>{request_id}</> "
    "| <lvl>{message}</>"
)
```

其中 `{request_id}` 由 `request_id_filter` 过滤器注入，从 `ContextMiddleware` 设置的 Nano ID 中获取：

```python
def request_id_filter(record: dict) -> dict:
    rid = get_request_nanoid()
    record["request_id"] = rid
    return record
```

:::tip
请求 ID 使得在高并发场景下可以将同一请求的所有日志关联在一起，极大简化了问题排查流程。
:::

## 日志初始化

`setup_logging` 函数在应用启动时执行，完成以下配置：

1. 将标准库根 logger 的 handler 替换为 `InterceptHandler`
2. 清空所有已注册 logger 的默认 handler
3. 禁止 `uvicorn.access` 和 `watchfiles.main` 的日志传播（避免重复输出）
4. 移除 Loguru 默认 handler，配置自定义的控制台输出

```python
def setup_logging() -> None:
    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(settings.LOG_LEVEL)

    for name in logging.root.manager.loggerDict.keys():
        logging.getLogger(name).handlers = []
        if "uvicorn.access" in name or "watchfiles.main" in name:
            logging.getLogger(name).propagate = False
        else:
            logging.getLogger(name).propagate = True

    ruLogger.remove()
    ruLogger.configure(handlers=[{
        "sink": sys.stdout,
        "level": settings.LOG_LEVEL,
        "format": default_formatter,
        "filter": lambda record: request_id_filter(record),
    }])
```

## 文件日志

`set_custom_logfile` 函数配置双文件日志输出，按级别分离：

| 文件         | 级别范围                       | 说明                       |
| ------------ | ------------------------------ | -------------------------- |
| `access.log` | `<= INFO`（level.no <= 25）    | 常规访问日志，不含堆栈追踪 |
| `error.log`  | `>= WARNING`（level.no >= 30） | 错误日志，包含完整堆栈追踪 |

两个文件共享相同的轮转策略：

```python
log_config = {
    "format": default_formatter,
    "enqueue": True,         # 异步写入，线程安全
    "rotation": "00:00",     # 每天午夜轮转
    "retention": "7 days",   # 保留 7 天
    "compression": lambda filepath: os.rename(filepath, compression(filepath)),
}
```

:::warning
`error.log` 启用了 `backtrace=True` 和 `diagnose=True`，会在日志中包含变量值等诊断信息。生产环境中需注意敏感数据泄露风险。
:::

## 配置环境变量

| 环境变量                | 类型     | 默认值       | 说明                 |
| ----------------------- | -------- | ------------ | -------------------- |
| `LOG_LEVEL`             | `string` | `INFO`       | 全局日志级别         |
| `LOG_FILE_ACCESS_LEVEL` | `string` | `INFO`       | 访问日志文件最低级别 |
| `LOG_FILE_ERROR_LEVEL`  | `string` | `WARNING`    | 错误日志文件最低级别 |
| `LOG_ACCESS_FILENAME`   | `string` | `access.log` | 访问日志文件名       |
| `LOG_ERROR_FILENAME`    | `string` | `error.log`  | 错误日志文件名       |
| `LOG_FORMAT`            | `string` | 见上文       | Loguru 格式字符串    |

## SQLAlchemy 日志处理

`default_formatter` 对 SQLAlchemy 的日志做了特殊处理，将多行 SQL 语句压缩为单行，提升日志可读性：

```python
def default_formatter(record: dict) -> str:
    record_name = record["name"] or ""
    if record_name.startswith("sqlalchemy"):
        record["message"] = re.sub(r"\s+", " ", record["message"]).strip()
    # ...
```
