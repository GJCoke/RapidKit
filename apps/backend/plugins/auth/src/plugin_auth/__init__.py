"""
Authentication plugin — identity verification and token lifecycle.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_common.protocols.auth import (
    Authenticator,
    CurrentUserProvider,
    PasswordDecryptor,
    SessionInvalidator,
    TokenDecoder,
)
from rapidkit_common.protocols.user import UserResolver
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry


def register() -> PluginManifest:
    from rapidkit_common.auth import _get_current_user_placeholder

    from plugin_auth.auth.api import router
    from plugin_auth.auth.deps import get_current_user_form_db
    from plugin_auth.providers import (
        AuthenticatorImpl,
        CurrentUserProviderImpl,
        PasswordDecryptorImpl,
        SessionInvalidatorImpl,
        TokenDecoderImpl,
    )

    def register_services(registry: ServiceRegistry) -> None:
        user_resolver = registry.get(UserResolver)
        registry.register(TokenDecoder, TokenDecoderImpl())
        registry.register(Authenticator, AuthenticatorImpl(user_resolver))
        registry.register(CurrentUserProvider, CurrentUserProviderImpl(user_resolver))
        registry.register(PasswordDecryptor, PasswordDecryptorImpl())
        registry.register(SessionInvalidator, SessionInvalidatorImpl())

    return PluginManifest(
        name="auth",
        version="0.1.0",
        router=router,
        models=[],
        dependencies=["user"],
        requires=[UserResolver],
        provides=[TokenDecoder, Authenticator, CurrentUserProvider, PasswordDecryptor, SessionInvalidator],
        service_factories={TokenDecoder: register_services},
        dependency_overrides={
            _get_current_user_placeholder: get_current_user_form_db,
        },
    )
