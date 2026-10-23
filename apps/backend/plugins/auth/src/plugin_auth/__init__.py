"""
Authentication plugin — identity verification and token lifecycle.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_common.events import UserCreatedEvent, UserInviteRequestedEvent
from rapidkit_common.protocols.auth import (
    AuthContextResolver,
    Authenticator,
    CurrentUserProvider,
    PasswordDecryptor,
    SessionInvalidator,
    TokenDecoder,
)
from rapidkit_common.protocols.impersonation import ImpersonationRevoker, ImpersonationSessionReader
from rapidkit_common.protocols.user import UserResolver
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_auth.auth.resolver import AuthContextResolverImpl
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_auth.impersonation.service import ImpersonationService
from plugin_auth.impersonation.session_reader import ImpersonationSessionReaderImpl


def register() -> PluginManifest:
    from fastapi import APIRouter
    from rapidkit_common.auth import DenyImpersonation, _get_current_user_placeholder

    from plugin_auth.audit import configure_audit
    from plugin_auth.auth.api import router as auth_router
    from plugin_auth.auth.deps import get_current_user_form_db
    from plugin_auth.impersonation.api import router as impersonation_router
    from plugin_auth.impersonation.deps import DenyImpersonation as deny_impersonation
    from plugin_auth.invite.api import router as invite_router
    from plugin_auth.invite.handlers import on_invite_requested, on_user_created
    from plugin_auth.password_reset.api import router as password_reset_router
    from plugin_auth.providers import (
        AuthenticatorImpl,
        CurrentUserProviderImpl,
        PasswordDecryptorImpl,
        SessionInvalidatorImpl,
        TokenDecoderImpl,
    )
    from plugin_auth.rate_limit import configure_rate_limits

    router = APIRouter()
    router.include_router(auth_router)
    router.include_router(impersonation_router)
    router.include_router(invite_router)
    router.include_router(password_reset_router)

    def register_services(registry: ServiceRegistry) -> None:
        user_resolver = registry.get(UserResolver)
        service = ImpersonationService(AsyncSessionLocal, _LazyRedis(), None, None)
        resolver = AuthContextResolverImpl(AsyncSessionLocal, RedisManager.client, service)
        registry.register(ImpersonationRevoker, service)
        registry.register(ImpersonationSessionReader, ImpersonationSessionReaderImpl(AsyncSessionLocal))
        registry.register(AuthContextResolver, resolver)
        registry.register(TokenDecoder, TokenDecoderImpl(resolver))
        registry.register(Authenticator, AuthenticatorImpl(user_resolver))
        registry.register(CurrentUserProvider, CurrentUserProviderImpl(resolver))
        registry.register(PasswordDecryptor, PasswordDecryptorImpl())
        registry.register(SessionInvalidator, SessionInvalidatorImpl())

    return PluginManifest(
        name="auth",
        version="0.1.0",
        router=router,
        audit_actions=configure_audit(router),
        models=[ImpersonationSession],
        dependencies=["user"],
        requires=[UserResolver],
        provides=[
            ImpersonationRevoker,
            ImpersonationSessionReader,
            AuthContextResolver,
            TokenDecoder,
            Authenticator,
            CurrentUserProvider,
            PasswordDecryptor,
            SessionInvalidator,
        ],
        service_factories={TokenDecoder: register_services},
        on_startup=[configure_rate_limits],
        event_listeners=[
            (UserCreatedEvent, on_user_created),
            (UserInviteRequestedEvent, on_invite_requested),
        ],
        task_modules=[
            "plugin_auth.invite.tasks",
            "plugin_auth.password_reset.tasks",
            "plugin_auth.impersonation.tasks",
        ],
        beat_schedule={"expire-impersonation-sessions": {"task": "expire_impersonation_sessions", "schedule": 60.0}},
        dependency_overrides={
            _get_current_user_placeholder: get_current_user_form_db,
            DenyImpersonation: deny_impersonation,
        },
    )


class _LazyRedis:
    """Defer Redis acquisition until lifespan has connected the manager."""

    def __getattr__(self, name):
        return getattr(RedisManager.client(), name)
