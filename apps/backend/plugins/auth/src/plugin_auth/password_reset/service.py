"""Password-reset issuance and confirmation services."""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.events import UserPasswordChangedEvent
from rapidkit_common.protocols.auth import PasswordDecryptor, SessionInvalidator
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service

from plugin_auth.auth.crud import UserCRUD
from plugin_auth.invite.config import invite_settings
from plugin_auth.password_reset.token_store import PasswordResetTokenStore
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")


def _enqueue_password_reset_email(*, email: str, user_name: str, reset_link: str) -> None:
    from plugin_auth.password_reset.tasks import send_password_reset_email

    send_password_reset_email.apply_async(kwargs={"email": email, "user_name": user_name, "reset_link": reset_link})


async def request_password_reset(
    email: str,
    ip: str,
    *,
    store: PasswordResetTokenStore,
    user_crud: UserCRUD,
) -> None:
    """Issue and queue a reset email without exposing account eligibility."""
    normalized = email.strip().casefold()
    if not await store.allow_request(normalized, ip):
        return
    user = await user_crud.get_user_by_email(normalized)
    if not user or user.status != Status.ON:
        return
    token = await store.issue(user.id)
    reset_link = f"{invite_settings.FRONTEND_BASE_URL.rstrip('/')}/login/reset-password?token={token}"
    _enqueue_password_reset_email(email=user.email, user_name=user.name, reset_link=reset_link)


async def confirm_password_reset(
    token: str,
    new_password: str,
    *,
    store: PasswordResetTokenStore,
    user_crud: UserCRUD,
    redis,
    session,
) -> None:
    """Consume a reset token, replace the password, and revoke sessions."""
    user_id = await store.consume(token)
    if not user_id:
        raise AppException(AuthStatusCode.PASSWORD_RESET_TOKEN_INVALID)
    user = await user_crud.get(UUID(user_id), nullable=True)
    if not user or user.status != Status.ON:
        raise AppException(AuthStatusCode.PASSWORD_RESET_TOKEN_INVALID)
    password = get_service(PasswordDecryptor).decrypt_and_hash(new_password)
    await user_crud.update_by_id(user.id, {"password": password})
    invalidator = get_service(SessionInvalidator)
    after_commit(session, invalidator.invalidate_user_cache, user.id, redis)
    after_commit(session, invalidator.invalidate_user_sessions, user.id, redis)
    event_bus.fire_and_forget(UserPasswordChangedEvent(user_id=str(user.id)))
    logger.warning("Password reset completed for user {user_id}", user_id=user.id)
