"""Build the static permission catalog without application startup or runtime data."""

from pathlib import Path

from fastapi import APIRouter, FastAPI
from plugin_permission.catalog.registry import PermissionCatalog, build_catalog
from plugin_permission.catalog.route_check import collect_route_bindings
from rapidkit_core.config import settings
from rapidkit_framework.loader import discover_and_load_plugins


def load_static_catalog() -> tuple[PermissionCatalog, dict[str, str]]:
    """Read declared plugin resources and API bindings, without database access."""
    result = discover_and_load_plugins(config_path=Path(__file__).resolve().parents[1] / "plugins.toml")
    router = APIRouter(prefix=settings.API_PREFIX_V1)
    for plugin in result.plugins:
        if plugin.router is not None:
            router.include_router(plugin.router)
    app = FastAPI()
    app.include_router(router)
    bindings = collect_route_bindings(app.routes)
    return build_catalog(result.plugins, bindings), bindings
