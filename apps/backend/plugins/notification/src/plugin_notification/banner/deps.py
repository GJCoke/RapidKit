"""Request dependencies for banner reads and checks."""

from typing import Annotated

from fastapi import Depends
from rapidkit_common.deps import SessionDep

from plugin_notification.banner.services import BannerAnnouncementService


def get_banner_service(session: SessionDep) -> BannerAnnouncementService:
    return BannerAnnouncementService(session=session)


BannerServiceDep = Annotated[BannerAnnouncementService, Depends(get_banner_service)]
