from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient


async def test_browser_can_read_application_and_gateway_request_ids():
    # Socket.IO's optional admin instrumentation starts a task during app import.
    from src.main import app as rapidkit_app

    configured = next(item for item in rapidkit_app.user_middleware if item.cls is CORSMiddleware)
    app = FastAPI()
    app.add_middleware(CORSMiddleware, **{**configured.kwargs, "allow_origins": ["https://frontend.example"]})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api.example") as client:
        response = await client.get("/probe", headers={"Origin": "https://frontend.example"})
    exposed = {name.strip().lower() for name in response.headers["access-control-expose-headers"].split(",")}
    assert exposed >= {"x-request-id", "x-edge-request-id"}
    assert response.headers["access-control-allow-origin"] == "https://frontend.example"
