"""Verify protocol definitions are importable and structurally correct."""

from typing import Protocol, runtime_checkable
from uuid import UUID

from rapidkit_common.protocols import (
    Authenticator,
    CurrentUserProvider,
    DepartmentResolver,
    PermissionChecker,
    PolicyLoader,
    TokenDecoder,
    UserProtocol,
    UserQueryService,
    UserResolver,
)


def test_protocols_are_importable():
    """All protocols should be importable from the barrel."""
    assert UserProtocol is not None
    assert UserResolver is not None
    assert UserQueryService is not None
    assert TokenDecoder is not None
    assert Authenticator is not None
    assert CurrentUserProvider is not None
    assert PermissionChecker is not None
    assert PolicyLoader is not None
    assert DepartmentResolver is not None


def test_user_protocol_is_protocol():
    assert issubclass(UserProtocol, Protocol)


def test_token_decoder_is_protocol():
    assert issubclass(TokenDecoder, Protocol)
