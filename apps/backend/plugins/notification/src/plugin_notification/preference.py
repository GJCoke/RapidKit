"""偏好解析（P1 no-op 直通）。

P1 不引入偏好表；保留稳定接口，供 P3 用真实实现替换而不影响调用方。
"""

from uuid import UUID


class PreferenceResolver:
    """P1：所有用户对所有分类均允许接收。"""

    async def filter_allowed(
        self,
        user_ids: list[UUID],
        *,
        category: str,
        mandatory: bool,
    ) -> list[UUID]:
        """Return an independent recipient list until preferences are introduced."""
        return list(user_ids)
