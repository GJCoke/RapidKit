"""Only the ASGI server's trusted proxy processing determines client identity."""

import pytest
from starlette.requests import Request

from rapidkit_common.request import get_client_ip


@pytest.mark.parametrize("header", ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"])
def test_get_client_ip_does_not_trust_headers(header):
    request = Request(
        {
            "type": "http",
            "client": ("203.0.113.8", 1234),
            "headers": [(header.encode(), b"198.51.100.9")],
        }
    )
    assert get_client_ip(request) == "203.0.113.8"


@pytest.mark.parametrize(
    "client, expected", [(None, None), (("testclient", 0), "127.0.0.1"), (("2001:db8::1", 0), "2001:db8::1")]
)
def test_get_client_ip_missing_test_and_ipv6_clients(client, expected):
    request = Request({"type": "http", "client": client, "headers": []})
    assert get_client_ip(request) == expected
