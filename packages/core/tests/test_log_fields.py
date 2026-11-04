import io
import json
from functools import partial

from rapidkit_core import log


def test_branch_fields_reach_json():
    stream = io.StringIO()
    handler = log.logger.add(partial(log.json_sink, stream=stream), level="DEBUG")
    try:
        log.logger.bind(
            event="x.y.skipped",
            outcome="skipped",
            reason_code="r",
            resource_type="menu",
            resource_id="42",
            filtered_count=3,
            affected_count=0,
        ).info("Branch skipped")
    finally:
        log.logger.remove(handler)
    record = json.loads(stream.getvalue().splitlines()[-1])
    assert record["resource_type"] == "menu"
    assert record["resource_id"] == "42"
    assert record["filtered_count"] == 3
    assert record["affected_count"] == 0
