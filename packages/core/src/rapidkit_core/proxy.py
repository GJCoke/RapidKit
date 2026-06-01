"""Generic lazy proxy — defers object creation to first attribute access."""

from typing import Any, Callable

_SENTINEL = object()


class LazyProxy:
    """
    Transparent proxy that creates its target on first attribute access.

    Usage:
        settings = LazyProxy(Config)  # Config() NOT called yet
        settings.HOST  # NOW Config() is called, .HOST forwarded
    """

    __slots__ = ("_factory", "_instance")

    def __init__(self, factory: Callable[..., Any]) -> None:
        object.__setattr__(self, "_factory", factory)
        object.__setattr__(self, "_instance", _SENTINEL)

    def get_instance(self) -> Any:
        instance = object.__getattribute__(self, "_instance")
        if instance is _SENTINEL:
            factory = object.__getattribute__(self, "_factory")
            instance = factory()
            object.__setattr__(self, "_instance", instance)
        return instance

    def reset(self, factory: Callable[..., Any] | None = None) -> None:
        """Clear cached instance. Optionally replace factory."""
        if factory is not None:
            object.__setattr__(self, "_factory", factory)
        object.__setattr__(self, "_instance", _SENTINEL)

    def set_instance(self, instance: Any) -> None:
        """Directly inject an instance (for testing / runtime override)."""
        object.__setattr__(self, "_instance", instance)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.get_instance()(*args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(self.get_instance(), name)

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self.get_instance(), name, value)

    def __repr__(self) -> str:
        instance = object.__getattribute__(self, "_instance")
        if instance is _SENTINEL:
            factory = object.__getattribute__(self, "_factory")
            return f"<LazyProxy(uninitialized) factory={factory!r}>"
        return repr(instance)
