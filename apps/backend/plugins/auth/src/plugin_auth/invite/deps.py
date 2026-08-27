"""FastAPI dependencies for invite tokens."""

from fastapi import Depends
from rapidkit_common.deps import RedisDep
from typing_extensions import Annotated, Doc

from plugin_auth.invite.token_store import InviteTokenStore


async def get_invite_token_store(redis: RedisDep) -> InviteTokenStore:
    return InviteTokenStore(redis)


InviteTokenStoreDep = Annotated[
    InviteTokenStore,
    Depends(get_invite_token_store),
    Doc("Invite token lifecycle manager."),
]
