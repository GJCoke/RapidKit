"""Dashboard capability schemas."""

from rapidkit_common.schemas.base import BaseModel


class DashboardCapabilitiesResponse(BaseModel):
    """Dashboard modules the current user may load."""

    allowed_modules: list[str]
    revision: str
