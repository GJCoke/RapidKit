"""FastAPI dependencies for password-reset tokens."""

from fastapi import Depends
from rapidkit_common.deps import RedisDep
from typing_extensions import Annotated, Doc

from plugin_auth.password_reset.token_store import PasswordResetTokenStore


async def get_password_reset_token_store(redis: RedisDep) -> PasswordResetTokenStore:
    return PasswordResetTokenStore(redis)


PasswordResetTokenStoreDep = Annotated[
    PasswordResetTokenStore,
    Depends(get_password_reset_token_store),
    Doc("Password-reset token lifecycle manager."),
]
