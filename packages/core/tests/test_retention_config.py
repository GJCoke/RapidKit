from collections.abc import Callable

import pytest
from pydantic import ValidationError
from rapidkit_core.config import Config

# BaseSettings accepts _env_file outside the synthesized model-field signature.
config_factory: Callable[..., Config] = Config


def test_complete_config_disables_retention_without_environment_setting(monkeypatch):
    monkeypatch.delenv("TASK_RESULT_RETENTION_DAYS", raising=False)
    assert config_factory(_env_file=None).TASK_RESULT_RETENTION_DAYS is None


@pytest.mark.parametrize("days", ["0", "-1"])
def test_complete_config_rejects_nonpositive_retention(monkeypatch, days):
    monkeypatch.setenv("TASK_RESULT_RETENTION_DAYS", days)
    with pytest.raises(ValidationError):
        config_factory(_env_file=None)


def test_complete_config_accepts_explicit_retention(monkeypatch):
    monkeypatch.setenv("TASK_RESULT_RETENTION_DAYS", "30")
    assert config_factory(_env_file=None).TASK_RESULT_RETENTION_DAYS == 30
