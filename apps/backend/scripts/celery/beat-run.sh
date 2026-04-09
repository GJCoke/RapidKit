#!/usr/bin/env bash

uv run celery -A "src.queues.app" beat -S "src.queues.scheduler:AsyncDatabaseScheduler" -l info
