"""Invite request and response schemas."""

from rapidkit_common.schemas import BaseModel, BaseRequest


class SetPasswordBody(BaseRequest):
    """Set a password using an encrypted password and invite token."""

    token: str
    new_password: str


class InviteValidateResponse(BaseModel):
    """Invite validity without consuming it."""

    valid: bool
