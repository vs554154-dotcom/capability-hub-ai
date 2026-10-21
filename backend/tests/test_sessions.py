"""Server-side sessions.

The cookie holds only a random session id. Whether that id still signs anyone in is
decided by its row in the sessions table, so the server can end a session - and a
copy of the cookie stops working with it.

These tests sign in as E1019, an account no other test uses, because one of them
changes its password.
"""
from __future__ import annotations

import json
from base64 import b64decode, b64encode

import itsdangerous
from fastapi.testclient import TestClient

from backend.app.config import SESSION_COOKIE_NAME, SESSION_SECRET
from backend.app.database import execute, query_all, query_one
from backend.app.main import app
from backend.app.repositories import sessions

from .conftest import PASSWORD

ACCOUNT = "E1019"


def sign_in(password: str = PASSWORD) -> TestClient:
    client = TestClient(app)
    response = client.post("/api/auth/login", json={"identifier": ACCOUNT, "password": password})
    assert response.status_code == 200, response.text
    return client


def cookie_of(client: TestClient) -> str:
    return client.cookies.get(SESSION_COOKIE_NAME)


def client_with_cookie(value: str) -> TestClient:
    client = TestClient(app)
    client.cookies.set(SESSION_COOKIE_NAME, value)
    return client


def payload_of(cookie: str) -> dict:
    """What the cookie carries. Starlette's format is base64(json).timestamp.signature,
    and base64 never contains a dot."""
    return json.loads(b64decode(cookie.split(".")[0]))


def signed_cookie(data: dict) -> str:
    """A cookie signed exactly as the app signs one, with the app's secret."""
    encoded = b64encode(json.dumps(data).encode("utf-8"))
    return itsdangerous.TimestampSigner(SESSION_SECRET).sign(encoded).decode("utf-8")


def is_signed_in(client: TestClient) -> bool:
    return client.get("/api/auth/me").status_code == 200


# --------------------------------------------------------------------------- #
# What the cookie carries
# --------------------------------------------------------------------------- #

def test_the_cookie_carries_only_a_session_id():
    payload = payload_of(cookie_of(sign_in()))
    assert set(payload) == {"sid"}
    assert query_one("SELECT userId FROM sessions WHERE id = ?", (payload["sid"],))["userId"] == ACCOUNT


def test_a_validly_signed_cookie_for_a_live_session_is_accepted():
    # Control for the next test: a cookie built by signed_cookie() works when the
    # session it names is live, so a rejection below is about the content alone.
    sid = payload_of(cookie_of(sign_in()))["sid"]
    assert is_signed_in(client_with_cookie(signed_cookie({"sid": sid})))


def test_a_signed_cookie_naming_only_a_user_id_is_rejected():
    # The previous cookie format. A cookie signed before this change still verifies,
    # but it names a user instead of a session, so it must not sign anyone in.
    assert not is_signed_in(client_with_cookie(signed_cookie({"userId": ACCOUNT})))


def test_a_signed_cookie_naming_an_unknown_session_is_rejected():
    assert not is_signed_in(client_with_cookie(signed_cookie({"sid": "no-such-session"})))


# --------------------------------------------------------------------------- #
# Ending sessions
# --------------------------------------------------------------------------- #

def test_signing_out_ends_the_session_for_every_copy_of_the_cookie():
    browser = sign_in()
    copy = client_with_cookie(cookie_of(browser))
    assert is_signed_in(copy)

    assert browser.post("/api/auth/logout").status_code == 200

    assert not is_signed_in(browser)
    assert not is_signed_in(copy)


def test_signing_out_leaves_the_users_other_sessions_alone():
    laptop, phone = sign_in(), sign_in()
    laptop.post("/api/auth/logout")
    assert is_signed_in(phone)


def test_signing_in_again_ends_the_session_the_browser_had():
    browser = sign_in()
    old_copy = client_with_cookie(cookie_of(browser))

    response = browser.post("/api/auth/login", json={"identifier": ACCOUNT, "password": PASSWORD})
    assert response.status_code == 200

    assert is_signed_in(browser)
    assert not is_signed_in(old_copy)


def test_changing_the_password_signs_out_the_users_other_sessions():
    current, other = sign_in(), sign_in()
    try:
        response = current.post(
            "/api/auth/change-password",
            json={"currentPassword": PASSWORD, "newPassword": "changed-pass"},
        )
        assert response.status_code == 200, response.text
        assert is_signed_in(current)
        assert not is_signed_in(other)
    finally:
        restore = sign_in("changed-pass").post(
            "/api/auth/change-password",
            json={"currentPassword": "changed-pass", "newPassword": PASSWORD},
        )
        assert restore.status_code == 200, restore.text


def test_an_expired_session_is_rejected():
    client = sign_in()
    sid = payload_of(cookie_of(client))["sid"]
    execute("UPDATE sessions SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE id = ?", (sid,))
    assert not is_signed_in(client)


# --------------------------------------------------------------------------- #
# Housekeeping
# --------------------------------------------------------------------------- #

def test_long_finished_sessions_are_deleted_and_live_ones_kept():
    live = payload_of(cookie_of(sign_in()))["sid"]
    rows = [
        ("old_expired", "2000-01-01T00:00:00.000Z", None),
        ("old_ended", "2999-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z"),
    ]
    for sid, expires, revoked in rows:
        execute(
            "INSERT INTO sessions (id, userId, createdAt, expiresAt, revokedAt) VALUES (?, ?, ?, ?, ?)",
            (sid, ACCOUNT, "2000-01-01T00:00:00.000Z", expires, revoked),
        )

    sessions.purge_finished()

    remaining = {
        row["id"] for row in query_all(
            "SELECT id FROM sessions WHERE id IN (?, ?, ?)", (live, "old_expired", "old_ended")
        )
    }
    assert remaining == {live}
