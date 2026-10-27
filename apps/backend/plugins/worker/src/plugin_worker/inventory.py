"""Current instances, deployment intent and per-group capacity."""

from datetime import timedelta

from rapidkit_common.enums import WorkerStatus
from rapidkit_core.config import settings
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import col, or_, select

from plugin_worker.models import CeleryWorker, WorkerGroup
from plugin_worker.schemas import WorkerGroupResponse

logger = get_plugin_logger("Worker")

HEARTBEAT_TIMEOUT_SECONDS = 60
CAPACITY_GRACE_SECONDS = 120


def scoped_worker_filters(*, history=False) -> list[ColumnElement[bool]]:
    filters = [col(CeleryWorker.lifecycle) == "retired" if history else col(CeleryWorker.lifecycle) != "retired"]
    if settings.CELERY_WORKER_NAMES and not history:
        filters.append(
            or_(CeleryWorker.group_name != "legacy", col(CeleryWorker.hostname).in_(settings.CELERY_WORKER_NAMES))
        )
    return filters


def is_current_worker(hostname: str, group_name: str = "legacy") -> bool:
    return group_name != "legacy" or not settings.CELERY_WORKER_NAMES or hostname in settings.CELERY_WORKER_NAMES


async def ensure_group(session, name: str) -> WorkerGroup:
    group = (await session.exec(select(WorkerGroup).where(WorkerGroup.name == name).with_for_update())).first()
    if group is None:
        try:
            async with session.begin_nested():
                group = WorkerGroup(name=name)
                session.add(group)
                await session.flush()
        except IntegrityError:
            group = (await session.exec(select(WorkerGroup).where(WorkerGroup.name == name).with_for_update())).one()
    return group


async def group_summaries(session, now) -> list[WorkerGroupResponse]:
    groups = {g.name: g for g in (await session.exec(select(WorkerGroup))).all()}
    workers = (await session.exec(select(CeleryWorker).where(*scoped_worker_filters()))).all()
    names = sorted(set(groups) | {w.group_name for w in workers})
    summaries = []
    for name in names:
        members = [w for w in workers if w.group_name == name]
        group = groups.get(name)
        expected = group.expected_replicas if group else None
        if settings.CELERY_WORKER_NAMES and name == "legacy":
            expected = len(settings.CELERY_WORKER_NAMES)
        online = sum(
            w.lifecycle == "active"
            and w.status == WorkerStatus.ONLINE
            and w.last_heartbeat >= now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
            for w in members
        )
        summaries.append(
            WorkerGroupResponse(
                name=name,
                expected_replicas=expected,
                online=online,
                observed=len(members),
                draining=sum(w.lifecycle == "draining" for w in members),
                missing=max(0, expected - online) if expected is not None else 0,
                alerting=bool(group and group.capacity_missing),
            )
        )
    # Legacy fixed-node deployments can be entirely absent from the discovery table.
    if settings.CELERY_WORKER_NAMES and "legacy" not in names:
        count = len(settings.CELERY_WORKER_NAMES)
        summaries.append(
            WorkerGroupResponse(
                name="legacy", expected_replicas=count, online=0, observed=0, draining=0, missing=count, alerting=False
            )
        )
    return summaries


async def prepare_deployment(session, name: str, replicas: int, deployment_id: str) -> WorkerGroup:
    if replicas < 0 or not deployment_id:
        raise ValueError("A nonnegative replica count and deployment ID are required")
    group = await ensure_group(session, name)
    if group.deployment_started_at is not None:
        raise ValueError("A deployment is already in progress")
    group.previous_expected_replicas = group.expected_replicas
    group.expected_replicas = replicas
    group.deployment_id = deployment_id
    group.deployment_started_at = timezone.now()
    workers = (
        await session.exec(
            select(CeleryWorker).where(CeleryWorker.group_name == name, CeleryWorker.lifecycle != "retired")
        )
    ).all()
    for worker in workers:
        worker.lifecycle = "draining"
        worker.retire_reason = deployment_id
    await session.flush()
    logger.info("Worker deployment prepared: group={} replicas={} deployment={}", name, replicas, deployment_id)
    return group


async def _pending_group(session, name, deployment_id):
    group = await ensure_group(session, name)
    if group.deployment_id != deployment_id or group.deployment_started_at is None:
        raise ValueError("Deployment does not match the pending operation")
    return group


async def finish_deployment(session, name: str, deployment_id: str) -> None:
    group = await _pending_group(session, name, deployment_id)
    workers = (
        await session.exec(
            select(CeleryWorker).where(
                CeleryWorker.group_name == name,
                CeleryWorker.lifecycle == "draining",
                CeleryWorker.retire_reason == deployment_id,
            )
        )
    ).all()
    for worker in workers:
        worker.lifecycle = "retired"
        worker.status = WorkerStatus.OFFLINE
        worker.retired_at = timezone.now()
        worker.active_task_count = 0
        worker.retire_reason = "deployment"
    group.deployment_started_at = None
    group.previous_expected_replicas = None
    await session.flush()
    logger.info("Worker deployment completed: group={} deployment={}", name, deployment_id)


async def abort_deployment(session, name: str, deployment_id: str) -> None:
    group = await _pending_group(session, name, deployment_id)
    workers = (
        await session.exec(
            select(CeleryWorker).where(
                CeleryWorker.group_name == name,
                CeleryWorker.lifecycle == "draining",
                CeleryWorker.retire_reason == deployment_id,
            )
        )
    ).all()
    for worker in workers:
        worker.lifecycle = "active"
        worker.retire_reason = ""
    group.expected_replicas = group.previous_expected_replicas
    group.previous_expected_replicas = None
    group.deployment_started_at = None
    group.deployment_id = ""
    # An aborted generation cannot fence surviving processes from the prior deployment.
    await session.flush()

    logger.warning("Worker deployment aborted: group={} deployment={}", name, deployment_id)
