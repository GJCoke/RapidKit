"""
Root conftest for apps/backend/tests/.

Imports shared fixtures from the testing package so all test files
under tests/ have access to session, redis, client, auth_headers, etc.
"""

from tests.testing.fixtures import *  # noqa: F401, F403
