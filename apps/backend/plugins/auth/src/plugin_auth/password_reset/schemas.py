"""Password-reset request and response schemas."""

from pydantic import EmailStr
from rapidkit_common.schemas import BaseModel, BaseRequest


class PasswordResetRequestBody(BaseRequest):
    """Public password-reset request."""

    email: EmailStr


class PasswordResetValidateQuery(BaseRequest):
    """Reset token validation query."""

    token: str


class PasswordResetConfirmBody(BaseRequest):
    """Encrypted password and single-use reset token."""

    token: str
    new_password: str


class PasswordResetValidateResponse(BaseModel):
    """Token validity without user disclosure."""

    valid: bool
