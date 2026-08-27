from rapidkit_common.enums import Status


def test_status_has_pending_member() -> None:
    assert Status.PENDING == "3"
    assert Status("3") is Status.PENDING
    assert Status.ON == "1"
    assert Status.OFF == "2"
