from rapidkit_common.audit import AuditContext


def test_atomic_batch_failure_has_zero_effective_targets():
    context = AuditContext()
    context.record.action = "user.batch-delete"
    context.record.resource_type = "user"
    context.captured = {"one": {"id": "one", "name": "First"}, "two": {"id": "two", "name": "Second"}}
    context.confirm("failure")
    record = context.snapshot()
    assert record.metadata.batch.succeeded == 0
    assert record.metadata.batch.affected == 0
    assert record.resource_id is None
    assert [item.result for item in record.targets] == ["failure", "failure"]
