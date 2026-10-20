from unittest.mock import patch

from fastapi_sio_di import AsyncServer

with patch.object(AsyncServer, 'instrument'):
    from src.sio.app import socket_cors_origins


def test_explicit_wildcard():
    assert socket_cors_origins(['*'], None, False) == '*'


def test_exact_origins():
    assert socket_cors_origins(['https://a.com'], None, False) == ['https://a.com']


def test_debug_admin_origin_without_mutating_config():
    origins = ['https://a.com']
    assert socket_cors_origins(origins, None, True) == ['https://a.com', 'https://admin.socket.io']
    assert origins == ['https://a.com']


def test_regex_and_exact_and_debug():
    check = socket_cors_origins(['https://a.com'], r'https://.*\.a\.com', True)
    assert check('https://x.a.com')
    assert check('https://a.com')
    assert check('https://admin.socket.io')
    assert not check('https://evil.com')
    assert not check('https://x.a.com.evil.com')
