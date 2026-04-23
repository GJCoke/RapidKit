"""
Socket.IO Redis key structures and shared constants.

Author : Coke
Date   : 2026-04-23
"""

user_sid_structure = "user:<{user_id}>:sid"
sid_user_structure = "sid:<{sid}>:user"
online_users_structure = "online_users"
authenticated_sid_structure = "authenticated_sid:<{sid}>"
SESSION_TTL = 120
