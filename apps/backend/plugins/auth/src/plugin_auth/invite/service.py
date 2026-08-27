"""Invite issuance, delivery scheduling, and account activation."""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.protocols.auth import PasswordDecryptor
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service

from plugin_auth.auth.crud import UserCRUD
from plugin_auth.invite.config import invite_settings
from plugin_auth.invite.email import EmailSender
from plugin_auth.invite.token_store import InviteTokenStore
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")


async def set_password_with_token(
    token: str,
    new_password: str,
    *,
    invite_store: InviteTokenStore,
    user_crud: UserCRUD,
) -> None:
    user_id = await invite_store.consume(token)
    if not user_id:
        raise AppException(AuthStatusCode.INVITE_TOKEN_INVALID)
    user = await user_crud.get(UUID(user_id), nullable=True)
    if not user or user.status != Status.PENDING:
        raise AppException(AuthStatusCode.INVITE_TOKEN_INVALID)
    hashed = get_service(PasswordDecryptor).decrypt_and_hash(new_password)
    await user_crud.update_by_id(user.id, {"password": hashed, "status": Status.ON})
    logger.info("User activated via invite: {user_id}", user_id=user.id)


async def issue_and_send_invite(user_id: UUID) -> None:
    from rapidkit_core.database import AsyncSessionLocal, RedisManager

    redis = RedisManager.client()
    async with AsyncSessionLocal() as session:
        user = await UserCRUD(session).get(user_id, nullable=True)
        if not user:
            logger.warning("Invite requested for missing user {user_id}", user_id=user_id)
            return
        if user.status != Status.PENDING:
            logger.info("Skipping invite for non-pending user {user_id}", user_id=user_id)
            return
        token = await InviteTokenStore(redis).issue(user_id)
        link = f"{invite_settings.FRONTEND_BASE_URL.rstrip('/')}/login/set-password?token={token}"
        from plugin_auth.invite.tasks import send_invite_email

        send_invite_email.apply_async(kwargs={"email": user.email, "user_name": user.name, "invite_link": link})


def build_email_sender() -> EmailSender:
    return EmailSender(
        host=invite_settings.SMTP_HOST,
        port=invite_settings.SMTP_PORT,
        user=invite_settings.SMTP_USER,
        password=invite_settings.SMTP_PASSWORD,
        sender=invite_settings.SMTP_FROM,
        use_tls=invite_settings.SMTP_USE_TLS,
    )
