import asyncio

import pytest
from rapidkit_common.schemas.response import Response
from rapidkit_framework import context as request_context


@pytest.mark.asyncio
async def test_serialized_business_codes_reach_shared_state_without_scope_leaks():
    async def serialize(code):
        state = {}
        with request_context.request_state_scope(state):
            await asyncio.sleep(0)
            Response(code=code).model_dump(mode="json")
            assert state["business_code"] == code
        return state

    success, failure = await asyncio.gather(serialize(0), serialize(1234))
    assert request_context.classify_request(success, 200, False) == ("success", None)
    assert request_context.classify_request(failure, 200, False) == ("error", "business")


def test_unknown_error_kinds_do_not_create_unbounded_metric_labels():
    assert request_context.classify_request({"business_code": 1234, "error_kind": "private-user-id"}, 200, False) == (
        "error",
        "business",
    )


def test_outer_response_code_is_not_overwritten_by_nested_serialization():
    state = {}
    with request_context.request_state_scope(state):
        Response(code=1234, data=Response(data=True)).model_dump(mode="json")
    assert state["business_code"] == 1234
