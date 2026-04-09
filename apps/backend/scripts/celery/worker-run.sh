#!/usr/bin/env bash

uv run celery -A "src.queues.app" worker -l info
