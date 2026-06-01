"""Unit tests for user service functions."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from plugin_user.services import filter_user


class TestFilterUser:
    def test_no_filters(self):
        result = filter_user(status=None, keyword="")
        assert result == []

    def test_status_filter(self):
        from rapidkit_common.enums import Status

        result = filter_user(status=Status.ON, keyword="")
        assert len(result) == 1

    def test_keyword_filter(self):
        result = filter_user(status=None, keyword="admin")
        assert len(result) == 1

    def test_both_filters(self):
        from rapidkit_common.enums import Status

        result = filter_user(status=Status.ON, keyword="test")
        assert len(result) == 2

    def test_keyword_escapes_wildcards(self):
        result = filter_user(status=None, keyword="100%")
        assert len(result) == 1


class TestProcessPassword:
    @patch("plugin_user.services.get_service")
    def test_calls_decryptor(self, mock_get_service):
        from plugin_user.services import process_password

        mock_decryptor = MagicMock()
        mock_decryptor.decrypt_and_hash.return_value = b"hashed"
        mock_get_service.return_value = mock_decryptor

        result = process_password("rsa_encrypted")

        mock_decryptor.decrypt_and_hash.assert_called_once_with("rsa_encrypted")
        assert result == b"hashed"


class TestDecryptUserPassword:
    @patch("plugin_user.services.get_service")
    def test_calls_decryptor(self, mock_get_service):
        from plugin_user.services import decrypt_user_password

        mock_decryptor = MagicMock()
        mock_decryptor.decrypt.return_value = "plain"
        mock_get_service.return_value = mock_decryptor

        result = decrypt_user_password("rsa_encrypted")

        mock_decryptor.decrypt.assert_called_once_with("rsa_encrypted")
        assert result == "plain"


class TestInvalidateUserCache:
    @pytest.mark.asyncio
    @patch("plugin_user.services.get_service")
    async def test_delegates_to_session_invalidator(self, mock_get_service):
        from plugin_user.services import invalidate_user_cache

        mock_invalidator = AsyncMock()
        mock_get_service.return_value = mock_invalidator
        redis = AsyncMock()
        user_id = uuid4()

        await invalidate_user_cache(redis, user_id)

        mock_invalidator.invalidate_user_cache.assert_called_once_with(user_id, redis)


class TestInvalidateUserPermissionCache:
    @pytest.mark.asyncio
    @patch("plugin_user.services.get_service")
    async def test_delegates_to_session_invalidator(self, mock_get_service):
        from plugin_user.services import invalidate_user_permission_cache

        mock_invalidator = AsyncMock()
        mock_get_service.return_value = mock_invalidator
        redis = AsyncMock()
        user_id = uuid4()

        await invalidate_user_permission_cache(redis, user_id)

        mock_invalidator.invalidate_permission_cache.assert_called_once_with(user_id, redis)


class TestInvalidateUserSession:
    @pytest.mark.asyncio
    @patch("plugin_user.services.get_service")
    async def test_delegates_to_session_invalidator(self, mock_get_service):
        from plugin_user.services import invalidate_user_session

        mock_invalidator = AsyncMock()
        mock_get_service.return_value = mock_invalidator
        redis = AsyncMock()
        user_id = uuid4()

        await invalidate_user_session(redis, user_id)

        mock_invalidator.invalidate_user_sessions.assert_called_once_with(user_id, redis)
