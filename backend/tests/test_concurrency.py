"""A slow request must not freeze the server.

Gemini calls and SQLite are blocking. Route handlers were previously `async def`,
which runs them directly on the event loop - so while one user waited on a slow
model response, every other request, including the health check, waited too.
Handlers are now plain `def`, and FastAPI runs them in its threadpool.

The test simulates a slow model call and measures how long an unrelated request
takes while it is in flight. With handlers on the event loop that request waits for
the whole slow call; in the threadpool it returns at once.
"""
from __future__ import annotations

import asyncio
import time

import httpx

from backend.app import ai
from backend.app.main import app

from .conftest import ACCOUNTS, PASSWORD

SLOW_SECONDS = 1.5


def _slow_generate(*_args, **_kwargs):
    time.sleep(SLOW_SECONDS)  # stands in for a slow, blocking Gemini round trip
    return "generated"


def test_slow_ai_call_does_not_block_other_requests(monkeypatch):
    monkeypatch.setattr(ai, "generate", _slow_generate)

    async def scenario() -> tuple[float, float, int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            login = await client.post(
                "/api/auth/login",
                json={"identifier": ACCOUNTS["employee"], "password": PASSWORD},
            )
            assert login.status_code == 200, login.text

            # Both timings are measured from one shared start. Timing the health
            # request from when *it* is sent would be wrong: a blocked loop delays the
            # 0.2s wake-up itself, so the block would hide inside the wait and the
            # request would still look fast.
            t0 = time.perf_counter()

            async def slow_call() -> tuple[float, int]:
                response = await client.post(
                    "/api/ai/orchestrator",
                    json={"userId": "E1000", "prompt": "What next?", "agent": "concierge"},
                )
                return time.perf_counter() - t0, response.status_code

            async def health_during_slow_call() -> float:
                await asyncio.sleep(0.2)  # let the slow call get under way first
                response = await client.get("/api/health")
                assert response.status_code == 200
                return time.perf_counter() - t0

            (slow_done, slow_status), health_done = await asyncio.gather(
                slow_call(), health_during_slow_call()
            )
            return slow_done, health_done, slow_status

    slow_done, health_done, slow_status = asyncio.run(scenario())

    assert slow_status == 200
    assert slow_done >= SLOW_SECONDS             # the simulated delay really happened
    # Sent at ~0.2s, the health check should be back long before the slow call ends.
    assert health_done < 0.7, (
        f"/api/health finished at {health_done:.2f}s, behind a {SLOW_SECONDS}s AI call "
        "that started first - a blocking call is running on the event loop."
    )
