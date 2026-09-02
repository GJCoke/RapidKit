"""Operations dashboard protocol tests."""

from rapidkit_common.protocols.operations import OperationsTrendPoint, ServerSnapshot


def test_operations_provider_values_are_plugin_neutral() -> None:
    server = ServerSnapshot(healthy=1, total=2)
    point = OperationsTrendPoint(date="2026-09-01", request_count=12, avg_response_ms=20.5)

    assert server.healthy == 1
    assert server.total == 2
    assert point.request_count == 12
    assert point.avg_response_ms == 20.5
