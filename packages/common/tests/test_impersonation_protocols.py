from dataclasses import FrozenInstanceError
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from rapidkit_common.protocols import (
    AuthContext,
    AuthContextResolver,
    CurrentUserProvider,
    ImpersonationAuditWriter,
    ImpersonationRevoker,
    ImpersonationSocketCloser,
)


def test_normal_and_impersonated_contexts():
    actor, subject = MagicMock(), MagicMock()
    session_id = uuid4()
    normal = AuthContext(subject=actor, actor=actor)
    impersonated = AuthContext(subject=subject, actor=actor, impersonation_session_id=session_id)
    assert normal.subject is normal.actor is actor
    assert normal.impersonation_session_id is None
    assert impersonated.subject is subject
    assert impersonated.actor is actor
    assert impersonated.impersonation_session_id == session_id
    with pytest.raises(FrozenInstanceError):
        impersonated.actor = subject


def test_shared_contracts_expose_auth_and_impersonation_operations():
    assert callable(AuthContextResolver.resolve)
    assert callable(CurrentUserProvider.get_auth_context)
    assert callable(CurrentUserProvider.get_current_user)
    assert callable(ImpersonationAuditWriter.append)
    assert callable(ImpersonationRevoker.revoke_user)
    assert callable(ImpersonationSocketCloser.close_session)
