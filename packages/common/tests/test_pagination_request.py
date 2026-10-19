"""Pagination query defaults and bounds without external services."""

from typing import Annotated

import pytest
from fastapi import FastAPI, Query
from fastapi.testclient import TestClient
from rapidkit_common.schemas.request import PaginatedRequest

app = FastAPI()


@app.get("/records")
def records(query: Annotated[PaginatedRequest, Query()]):
    return query.model_dump(by_alias=True)


client = TestClient(app)


def test_pagination_defaults_to_twenty():
    response = client.get("/records")
    assert response.status_code == 200
    assert response.json() == {"page": 1, "pageSize": 20}


@pytest.mark.parametrize("size", [1, 10, 20, 50, 100, 500])
def test_pagination_accepts_picker_sizes_and_legacy_clients(size):
    response = client.get("/records", params={"page": 2, "pageSize": size})
    assert response.status_code == 200
    assert response.json() == {"page": 2, "pageSize": size}


@pytest.mark.parametrize("size", [0, -1, 501, "20.5", "invalid"])
def test_pagination_rejects_out_of_bounds_or_invalid_sizes(size):
    assert client.get("/records", params={"pageSize": size}).status_code == 422
