# packages/framework/tests/test_scope_status_codes.py
from rapidkit_framework.status_codes import StatusCode


def test_scope_status_codes():
    assert StatusCode.RESOURCE_OUT_OF_SCOPE.value == (4002, "common.error.resourceOutOfScope")
    assert StatusCode.FIELD_WRITE_DENIED.value == (4003, "common.error.fieldWriteDenied")
