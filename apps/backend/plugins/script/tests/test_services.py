"""Unit tests for script service functions."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from plugin_script.services import execute_code, filter_script


class TestFilterScript:
    def test_no_filters(self):
        result = filter_script(status=None, language=None, keyword="")
        assert result == []

    def test_status_filter(self):
        from rapidkit_common.enums import Status

        result = filter_script(status=Status.ON, language=None, keyword="")
        assert len(result) == 1

    def test_language_filter(self):
        result = filter_script(status=None, language="python", keyword="")
        assert len(result) == 1

    def test_keyword_filter(self):
        result = filter_script(status=None, language=None, keyword="test")
        assert len(result) == 1

    def test_all_filters(self):
        from rapidkit_common.enums import Status

        result = filter_script(status=Status.ON, language="python", keyword="test")
        assert len(result) == 3

    def test_keyword_escapes_wildcards(self):
        result = filter_script(status=None, language=None, keyword="50%")
        assert len(result) == 1


class TestExecuteCode:
    @pytest.mark.asyncio
    async def test_unsupported_language_raises(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_script.status_codes import ScriptStatusCode

        with pytest.raises(AppException) as exc_info:
            await execute_code("ruby", "puts 'hi'")

        assert exc_info.value.code == ScriptStatusCode.UNSUPPORTED_LANGUAGE.code

    @pytest.mark.asyncio
    @patch("plugin_script.services.asyncio.create_subprocess_exec")
    async def test_successful_execution(self, mock_exec):
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b"hello\n", b"")
        mock_process.returncode = 0
        mock_exec.return_value = mock_process

        result = await execute_code("python", "print('hello')")

        assert result["stdout"] == "hello\n"
        assert result["stderr"] is None
        assert result["exit_code"] == 0
        assert "runtime" in result

    @pytest.mark.asyncio
    @patch("plugin_script.services.asyncio.create_subprocess_exec")
    async def test_execution_with_stderr(self, mock_exec):
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b"", b"error msg")
        mock_process.returncode = 1
        mock_exec.return_value = mock_process

        result = await execute_code("shell", "exit 1")

        assert result["stdout"] is None
        assert result["stderr"] == "error msg"
        assert result["exit_code"] == 1

    @pytest.mark.asyncio
    @patch("plugin_script.services.asyncio.wait_for")
    @patch("plugin_script.services.asyncio.create_subprocess_exec")
    async def test_timeout(self, mock_exec, mock_wait_for):
        mock_process = AsyncMock()
        mock_process.kill = MagicMock()
        mock_process.wait = AsyncMock()
        mock_exec.return_value = mock_process
        mock_wait_for.side_effect = asyncio.TimeoutError()

        result = await execute_code("python", "while True: pass")

        assert result["exit_code"] == -1
        assert "timed out" in result["stderr"]
        mock_process.kill.assert_called_once()
