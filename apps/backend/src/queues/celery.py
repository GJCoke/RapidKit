"""
Celery.

Author  : Coke
Date    : 2025-04-10
"""

from typing import Any

from celery import Celery as _Celery
from typing_extensions import Annotated, Doc

from src.queues.task import Task

MINUTES = 60
HOURS = 60 * MINUTES
DAYS = 24 * HOURS
WEEKDAYS = 7 * DAYS


class Celery(_Celery):
    """
    自定义 Celery。

    该类增强了 Celery 的 IDE 类型提示，并通过 asyncio 支持 async def 异步函数。
    """

    def task(
        self,
        *args: Any,
        name: Annotated[
            str | None,
            Doc(
                """
                每个任务必须有唯一名称。

                如果未显式指定名称，装饰器会自动生成，基于模块名和函数名。

                示例：
                    @app.task(name='sum-of-two-numbers')
                    def add(x, y):
                        return x + y

                    print(add.name) -> 'sum-of-two-numbers'
                """
            ),
        ] = None,
        base: Annotated[
            type[Task],
            Doc(
                """
                base 参数用于指定任务的基类，默认 celery.Task。
                可自定义基类以实现特殊行为或修改默认行为。

                示例：
                    import celery

                    class MyTask(celery.Task):
                        def on_failure(self, exc, task_id, args, kwargs, einfo):
                            print('{0!r} failed: {1!r}'.format(task_id, exc))

                    @app.task(base=MyTask)
                    def add(x, y):
                        raise KeyError()
                """
            ),
        ] = Task,
        bind: Annotated[
            bool,
            Doc(
                """
                bind=True 表示任务为绑定任务，run 方法会多一个 self 参数，代表当前任务实例。
                可通过 self 访问任务信息（如 task_id、重试等）及调用实例方法（如 self.retry()）。

                bind=False（默认）时，run 只接收任务参数，无法访问实例属性和方法。

                示例：
                    @app.task(bind=True)
                    def add(self: Task, x, y):
                        try:
                            return MyTask().run(x, y)
                        except TypeError:
                            self.retry()
                """
            ),
        ] = False,
        acks_late: Annotated[
            bool,
            Doc(
                """
                acks_late=True：任务执行成功后才发送确认，确保 worker 崩溃时任务不会丢失，会被重新分发。
                acks_late=False（默认）：worker 接收到任务即确认，worker 执行中崩溃可能导致任务丢失。

                适用于需要保证任务不丢失的场景。

                示例：
                    @app.task(acks_late=True)
                    def add(data):
                        if data == "error":
                            raise Exception("Something went wrong!")
                        return f"Processed {data}"
                """
            ),
        ] = False,
        max_retries: Annotated[
            int,
            Doc(
                """
                max_retries：任务失败后最大重试次数，达到上限后任务标记为失败。
                默认值为 3。
                可全局或单独设置。

                示例：
                    @app.task(bind=True, max_retries=3)
                    def add(data):
                        try:
                            if data == "error":
                                raise Exception("Something went wrong!")
                            return f"Processed {data}"
                        except Exception as e:
                            self.retry(exc=e, countdown=10)
                """
            ),
        ] = 3,
        default_retry_delay: Annotated[
            int,
            Doc(
                """
                default_retry_delay：任务失败重试的默认等待时间（秒），默认 300 秒（5 分钟）。
                可全局或单独设置。

                示例：
                    @app.task(bind=True, max_retries=3, default_retry_delay=300)
                    def add(data):
                        try:
                            if data == "error":
                                raise Exception("Something went wrong!")
                            return f"Processed {data}"
                        except Exception as e:
                            self.retry(exc=e)
                """
            ),
        ] = 3 * MINUTES,
        rate_limit: Annotated[
            int | float | str | None,
            Doc(
                """
                rate_limit：设置任务类型的速率限制（单位时间内可执行的任务数）。
                None 表示不限制，数字为每秒任务数。
                可用“/s”、“/m”、“/h”指定单位。

                示例：“100/m”表示每分钟最多 100 个任务。
                该限制为每个 worker 实例独立生效。

                示例：
                    @app.task(rate_limit="100/m")
                    def add():
                        return "Fetched data"
                """
            ),
        ] = None,
        time_limit: Annotated[
            int | None,
            Doc(
                """
                time_limit：任务最大执行时长（秒），超时将被强制终止。
                未设置时使用 worker 默认值。
                可全局或单独设置。

                示例：
                    @app.task(time_limit=10)
                    def process_data(data):
                        print(f"Processing {data}")
                        import time
                        time.sleep(20)
                        return f"Processed {data}"
                """
            ),
        ] = None,
        soft_time_limit: Annotated[
            int | None,
            Doc(
                """
                soft_time_limit：任务允许运行的软超时时间（秒），超时会抛出 SoftTimeLimitExceeded 异常。
                可用于优雅处理（如清理、日志等）。
                若超时后未终止，time_limit 会强制终止。

                示例：
                    @app.task(time_limit=15, soft_time_limit=10)
                    def process_data(data):
                        try:
                            print(f"Processing {data}...")
                            for i in range(1, 21):
                                print(f"Processing step {i} of 20")
                                time.sleep(1)
                        except SoftTimeLimitExceeded:
                            print(f"Soft time limit exceeded, stopping task gracefully...")
                        return f"Processed {data}"
                """
            ),
        ] = None,
        priority: Annotated[
            int,
            Doc(
                """
                priority：任务优先级，数值越小优先级越高。
                默认 0。
                RabbitMQ 支持原生优先级，Redis 通过顺序模拟。

                示例：
                    @app.task(priority=0)
                    def process_data(data):
                        print(f"Processing data: {data}")
                        return f"Processed {data}"
                """
            ),
        ] = 0,
        ignore_result: Annotated[
            bool,
            Doc(
                """
                ignore_result=True：不存储任务结果，无法通过 task.result 或 AsyncResult.get() 获取结果。
                ignore_result=False（默认）：结果会存储到后端，可随时获取。

                示例：
                    @app.task(ignore_result=True)
                    def send_email(recipient, subject, body):
                        print(f"Sending email to {recipient} with subject '{subject}'")
                        return "Email sent"
                """
            ),
        ] = False,
        store_errors_even_if_ignored: Annotated[
            bool,
            Doc(
                """
                store_errors_even_if_ignored=True：即使 ignore_result=True 也会存储任务异常。
                便于日志记录或追踪失败。

                示例：
                    @app.task(ignore_result=True, store_errors_even_if_ignored=True)
                    def process_data(data):
                        if data == "bad":
                            raise ValueError("An error occurred while processing data.")
                        print(f"Processing data: {data}")
                        return "Success"
                """
            ),
        ] = False,
        autoretry_for: Annotated[
            tuple[type[Exception]],
            Doc(
                """
                autoretry_for：指定哪些异常会自动触发任务重试，无需手动调用 retry。
                """
            ),
        ] = (),  # type: ignore
        retry_backoff: Annotated[
            bool,
            Doc(
                """
                retry_backoff=True：启用指数退避，重试间隔会指数增长。
                """
            ),
        ] = False,
        retry_backoff_max: Annotated[
            int,
            Doc(
                """
                retry_backoff_max：最大重试间隔，指数退避时不会超过该值。
                """
            ),
        ] = 600,
        queue: Annotated[
            str | None,
            Doc(
                """
                queue：任务队列名，决定任务被哪个 worker 消费。
                可用于负载均衡、优先级、任务隔离等。
                支持多队列，worker 可订阅多个队列。

                示例：
                    @app.task(queue='high_priority')
                    def high_priority_task():
                        print("Processing high-priority task")

                    @app.task(queue='low_priority')
                    def low_priority_task():
                        print("Processing low-priority task")
                """
            ),
        ] = None,
        track_started: Annotated[
            bool,
            Doc(
                """
                track_started=True：任务被 worker 执行时会上报“started”状态。
                适用于长时间运行的任务，便于追踪当前正在运行的任务。
                """
            ),
        ] = False,
        **kwargs: Annotated[
            dict[str, Any],
            Doc(
                """
                Celery 关键字参数。
                """
            ),
        ],
    ) -> type[Task]:
        # Added common parameters and corresponding annotations for Celery tasks, and by
        # default inherited from the Task class to support async def asynchronous function execution.
        return super().task(
            *args,
            name=name,
            base=base,
            bind=bind,
            acks_late=acks_late,
            max_retries=max_retries,
            default_retry_delay=default_retry_delay,
            rate_limit=rate_limit,
            priority=priority,
            ignore_result=ignore_result,
            time_limit=time_limit,
            soft_time_limit=soft_time_limit,
            autoretry_for=autoretry_for,
            retry_backoff=retry_backoff,
            retry_backoff_max=retry_backoff_max,
            queue=queue,
            store_errors_even_if_ignored=store_errors_even_if_ignored,
            track_started=track_started,
            **kwargs,
        )
