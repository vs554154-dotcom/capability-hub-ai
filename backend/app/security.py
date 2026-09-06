"""Password hashing.

bcrypt hashes written by bcryptjs (Node) and by this module are the same format,
so an account whose password was set under the Node server authenticates here and
vice versa. Both share the `users.passwordHash` column.
"""
from __future__ import annotations

import bcrypt

# bcryptjs in server.ts uses a cost factor of 10.
BCRYPT_ROUNDS = 10


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed or truncated hash in the column.
        return False
