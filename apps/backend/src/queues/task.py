"""
Celery Task.

Adds support for async def functions by converting asynchronous.

Author : Coke
Date   : 2025-04-12
"""

import asyncio
import io
import sys
import warnings
from datetime import datetime, timedelta
from typing import Any, Iterable

from celery import Task as _Task

# noinspection PyProtectedMember
from celery._state import _task_stack
from celery.app.routes import Router
from celery.canvas import Signature
from celery.result import AsyncResult
from kombu import Connection, Producer
from typing_extensions import Annotated, Doc


class Task(_Task):
    """
    支持异步（async def）任务的自定义 Celery 任务。

    重写了默认的 __call__ 方法，自动检测 run() 返回值是否为协程，若是则在事件循环中执行。
    """

    def apply_async(
        self,
        args: Annotated[
            tuple[Any] | None,
            Doc(
                """
                任务的位置参数（列表或元组）。
                """
            ),
        ] = None,
        kwargs: Annotated[
            dict[str, Any] | None,
            Doc(
                """
                任务的关键字参数（字典）。
                """
            ),
        ] = None,
        countdown: Annotated[
            int | float | None,
            Doc(
                """
                延迟执行的秒数。
                """
            ),
        ] = None,
        eta: Annotated[
            datetime | None,
            Doc(
                """
                任务的精确执行时间（datetime 对象）。
                """
            ),
        ] = None,
        expires: Annotated[
            int | float | datetime | None,
            Doc(
                """
                任务过期时间或剩余秒数。
                """
            ),
        ] = None,
        task_id: Annotated[
            str | None,
            Doc(
                """
                自定义任务 ID，未设置时 Celery 自动生成。
                """
            ),
        ] = None,
        retry: Annotated[
            bool,
            Doc(
                """
                任务失败时是否自动重试。
                """
            ),
        ] = False,
        retry_policy: Annotated[
            dict[str, Any] | None,
            Doc(
                """
                定义重试行为的字典（最大重试次数、间隔等）。
                """
            ),
        ] = None,
        queue: Annotated[
            str | None,
            Doc(
                """
                任务发送到的队列名称。
                """
            ),
        ] = None,
        priority: Annotated[
            int,
            Doc(
                """
                任务优先级（0 最高，255 最低）。
                """
            ),
        ] = 0,
        producer: Annotated[
            Producer | None,
            Doc(
                """
                自定义 kombu.Producer 实例用于发布任务消息。
                若提供，将替代 Celery 默认发布器，可自定义消息发布过程。
                """
            ),
        ] = None,
        connection: Annotated[
            Connection | None,
            Doc(
                """
                自定义消息中间件连接。
                """
            ),
        ] = None,
        link: Annotated[
            Signature | Iterable[Signature] | None,
            Doc(
                """
                当前任务成功后要调用的任务（或任务列表）。
                """
            ),
        ] = None,
        link_error: Annotated[
            Signature | Iterable[Signature] | None,
            Doc(
                """
                当前任务失败后要调用的任务（或任务列表）。
                """
            ),
        ] = None,
        chain: Annotated[
            Signature | list[Signature] | None,
            Doc(
                """
                后续任务链。
                """
            ),
        ] = None,
        shadow: Annotated[
            str | None,
            Doc(
                """
                使用任务原始名称（即函数名）。
                """
            ),
        ] = None,
        router: Annotated[
            Router | None,
            Doc(
                """
                自定义任务路由。
                """
            ),
        ] = None,
        add_to_parent: Annotated[
            bool,
            Doc(
                """
                添加到父任务组。
                """
            ),
        ] = True,
        group_id: Annotated[
            str | None,
            Doc(
                """
                任务组 ID。
                """
            ),
        ] = None,
        group_index: Annotated[
            int,
            Doc(
                """
                任务组内索引。
                """
            ),
        ] = 0,
        reply_to: Annotated[
            str | None,
            Doc(
                """
                回复队列名称。
                """
            ),
        ] = None,
        time_limit: Annotated[
            int | None,
            Doc(
                """
                硬超时时间。
                """
            ),
        ] = None,
        soft_time_limit: Annotated[
            int | None,
            Doc(
                """
                软超时时间。
                """
            ),
        ] = None,
        root_id: Annotated[
            str | None,
            Doc(
                """
                根任务 ID。
                """
            ),
        ] = None,
        parent_id: Annotated[
            str | None,
            Doc(
                """
                父任务 ID。
                """
            ),
        ] = None,
        route_name: Annotated[
            str | None,
            Doc(
                """
                路由名称。
                """
            ),
        ] = None,
        ignore_warning: Annotated[
            bool,
            Doc(
                """
                【自定义参数】是否忽略警告信息，默认 False。
                """
            ),
        ] = False,
        **options: Annotated[
            dict[str, Any],
            Doc(
                """
                Celery 选项参数。
                """
            ),
        ],
    ) -> AsyncResult:
        # Added full type annotations for Celery's apply_async method parameters,
        # enhancing code readability and IDE support.
        # For more parameter types, please refer to the official Celery documentation.

        if not ignore_warning:
            if (
                countdown is not None
                and countdown > 3600
                or eta is not None
                and eta > datetime.now() + timedelta(hours=1)
            ):
                warnings.warn(
                    "The recommended maximum duration for countdown is no more than 1 hour. If a task needs to "
                    "be delayed for longer than that, it's advisable to use scheduled task mechanisms such as "
                    "Celery Beat to ensure better reliability and resource efficiency."
                    "You can suppress this warning by setting the ignore_warning parameter to True.",
                    RuntimeWarning,
                )

        return super().apply_async(
            args=args,
            kwargs=kwargs,
            countdown=countdown,
            eta=eta,
            expires=expires,
            task_id=task_id,
            retry=retry,
            retry_policy=retry_policy,
            queue=queue,
            priority=priority,
            producer=producer,
            connection=connection,
            link=link,
            link_error=link_error,
            chain=chain,
            shadow=shadow,
            router=router,
            add_to_parent=add_to_parent,
            group_id=group_id,
            group_index=group_index,
            reply_to=reply_to,
            time_limit=time_limit,
            soft_time_limit=soft_time_limit,
            root_id=root_id,
            parent_id=parent_id,
            route_name=route_name,
            **options,
        )

    def __call__(self, *args: tuple[Any], **kwargs: dict[str, Any]) -> Any:
        """
        执行任务，支持同步和异步 run 方法。

        若 run() 返回协程，则自动检测当前事件循环并运行。

        Args:
            *args: 传递给任务的参数。
            **kwargs: 传递给任务的关键字参数。

        Returns:
            任务执行结果。

        Raises:
            Exception: 执行异常时抛出。
        """

        _task_stack.push(self)
        self.push_request(args=args, kwargs=kwargs)

        # 捕获任务执行期间的 stdout 输出作为日志。
        captured = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = captured

        try:
            # 调用原始 run() 方法。
            result = self.run(*args, **kwargs)
            # 检查返回值是否为协程。
            if asyncio.iscoroutine(result):
                try:
                    # 获取当前事件循环。
                    loop = asyncio.get_running_loop()
                    return loop.run_until_complete(result)

                except RuntimeError:
                    # 若无事件循环则新建。
                    return asyncio.run(result)

            # 非协程直接返回
            return result

        finally:
            sys.stdout = old_stdout
            self._logs = captured.getvalue() or None
            self.pop_request()
            _task_stack.pop()
