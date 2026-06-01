"""
Department plugin status codes (plugin_id=04).

6-digit format: 04TNNN
- T=2: business errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class DeptStatusCode(BaseStatusCode):
    """Department plugin error codes."""

    # Business errors (042xxx)
    HAS_CHILDREN = (42001, "department.error.hasChildren")
