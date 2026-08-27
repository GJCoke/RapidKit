from rapidkit_common.events import UserInviteRequestedEvent


def test_user_invite_requested_event() -> None:
    event = UserInviteRequestedEvent(user_id="abc")
    assert event.user_id == "abc"
    assert UserInviteRequestedEvent.event_name == "user.invite_requested"
