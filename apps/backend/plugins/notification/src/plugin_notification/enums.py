"""通知插件 —— 状态与类型常量。"""

from enum import Enum


class MessageStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    RECALLED = "recalled"


class OutboxStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    RETRYING = "retrying"
    SENT = "sent"
    DEAD = "dead"


# 投递参数（P1 固定值；后续可迁移到配置）
MAX_ATTEMPTS = 5
BASE_BACKOFF_SECONDS = 30
OUTBOX_LOCK_TTL_SECONDS = 120
DELIVERY_BATCH_SIZE = 100
