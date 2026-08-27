"""Invite event handlers."""

from uuid import UUID

from rapidkit_common.events import UserCreatedEvent, UserInviteRequestedEvent

from plugin_auth.invite.service import issue_and_send_invite


async def on_user_created(event: UserCreatedEvent) -> None:
    await issue_and_send_invite(UUID(event.user_id))


async def on_invite_requested(event: UserInviteRequestedEvent) -> None:
    await issue_and_send_invite(UUID(event.user_id))
