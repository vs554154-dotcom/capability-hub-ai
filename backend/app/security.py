"""Password hashing.

Hashes live in `users.passwordHash`. The former Node server wrote them with
bcryptjs in the same format, so a password claimed under it still authenticates.
"""
from __future__ import annotations

import bcrypt

# Cost factor 10, the same as hashes already stored.
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
