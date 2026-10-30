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
| `access.log` | 默认 INFO 至 SUCCESS（level.no <= 25） | 常规业务与访问日志，不含堆栈追踪 |
| `error.log`  | `>= WARNING`（level.no >= 30） | 错误日志，包含完整堆栈追踪 |

两个文件使用独立的轮转状态，同时满足下面两条规则，任意一条触发即轮转：

- **按天**：系统本地日期跨天后的下一条日志触发轮转。
- **按大小**：写入下一条日志将使文件超过 `LOG_FILE_MAX_BYTES` 时，先轮转再写入，默认 **100 MiB**（104857600 字节）。按 UTF-8 编码后的实际字节数计算。单条日志自身超过上限时会完整写入，不截断，所以该文件可以超过上限。

实际文件名带有 `hostname.pid` 实例后缀（如 `access.<hostname>.<pid>.log`），每个进程只写自己的文件，避免多进程轮转时互相覆盖。轮转后的文件名为 `access.<hostname>.<pid>.<日期>.log`，日期取文件最后写入时间的系统本地日期。同一天多次轮转会在日期后追加 `-2`、`-3` 等序号，已有文件不会被覆盖。

自定义文件名按 `Path` 的主干和扩展名插入实例标识：`requests.txt` 写入 `requests.<hostname>.<pid>.txt`；无扩展名时也会添加实例标识。目录路径保持原样，例如 `sub.log/requests.txt` 仍写入 `sub.log/`，归档和清理使用同样的文件名规则。

Celery worker 与 beat 调用 `set_custom_logfile(enqueue=False)`：prefork 子进程以 `os._exit` 退出，`enqueue` 创建的信号量来不及注销，停止 worker 时会刷出大量 `leaked semaphore objects` 警告。

:::warning
`error.log` 启用了 `backtrace=True`；`diagnose` 仅在非部署环境启用。开发环境的异常日志可能包含局部变量，分享日志前应检查敏感信息。
:::

### 跨进程过期清理

保留时间由 `LOG_FILE_RETENTION_DAYS` 控制，默认 **7 天**，以文件最后修改时间计算。每次初始化文件日志时清理一次；运行期间在写日志时检查，每个进程最多每小时扫描一次，没有日志写入时不会唤醒后台任务。

清理只扫描配置的 access/error 文件所在目录中的已知运行日志名：

- 所有实例可明确识别的过期日期归档，包括旧版 `access_YYYY-MM-DD.log`、`error_YYYY-MM-DD.log`。
- 本机已退出进程留下的过期 `access.<hostname>.<pid>.log`、`error.<hostname>.<pid>.log`，包括空文件。

本机仍存活的进程文件、无权限确认存活状态的进程文件、远程主机未归档的进程文件都会保留。远程进程的存活状态无法通过本机 PID 判断，因此共享日志目录中的这类文件应在对应主机上清理。清理跳过符号链接、子目录和其他命名的文件；并发删除不会报错，其他文件操作失败会向 stderr 输出提示并继续运行。

清理优先按活动文件名判断。例如 `access.worker.123.2026-01-01.456.log` 可能属于主机 `worker.123.2026-01-01` 的进程 `456`，不能仅凭日期认定它已归档。旧式 `日期.序号` 归档因此会保守保留，需要人工确认后清理；新式 `日期-序号` 避免了这一歧义。

### 开发验证日志

测试、构建、lint、类型检查和浏览器验证等临时输出统一放在 `logs/verification/`，与后端运行日志分开：

```bash
mkdir -p logs/verification
pnpm --filter @rapidkit/admin test > logs/verification/admin-test.log 2>&1
uv run pytest packages/core/tests > logs/verification/core-test.log 2>&1
```

该目录受 Git 忽略，不参与运行日志的自动过期清理。历史 `admin-migration-*.log` 也归入此目录，需要时可单独归档或手动清理。

## 配置环境变量

| 环境变量                | 类型     | 默认值       | 说明                 |
| ----------------------- | -------- | ------------ | -------------------- |
| `LOG_LEVEL`             | `string` | `INFO`       | 全局日志级别         |
| `LOG_FILE_ACCESS_LEVEL` | `string` | `INFO`       | 访问日志文件最低级别 |
| `LOG_FILE_ERROR_LEVEL`  | `string` | `WARNING`    | 错误日志文件最低级别 |
| `LOG_ACCESS_FILENAME`   | `string` | `access.log` | 访问日志文件名       |
| `LOG_ERROR_FILENAME`    | `string` | `error.log`  | 错误日志文件名       |
| `LOG_FILE_MAX_BYTES` | `int` | `104857600` | 单文件轮转字节上限，必须大于 0 |
| `LOG_FILE_RETENTION_DAYS` | `int` | `7` | 运行日志保留天数，必须大于 0 |
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
