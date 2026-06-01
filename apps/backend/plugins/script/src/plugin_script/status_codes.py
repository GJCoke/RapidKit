"""
Script plugin status codes (plugin_id=08).

6-digit format: 08TNNN
- T=1: parameter errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class ScriptStatusCode(BaseStatusCode):
    """Script plugin error codes."""

    # Parameter errors (081xxx)
    UNSUPPORTED_LANGUAGE = (81001, "script.error.unsupportedLanguage")
