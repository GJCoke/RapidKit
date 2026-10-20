"""Socket.IO Redis key structures and shared constants."""

user_sockets_structure = "sio:user:<{user_id}>:sockets"
presence_structure = "presence:user:<{user_id}>"
online_users_structure = "online_users"
SESSION_TTL = 120
