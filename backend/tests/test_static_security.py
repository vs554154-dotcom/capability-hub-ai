"""Regression tests for what the server will and will not hand to a browser.

Guards three real bugs:
  - the SPA route served any existing path, so /../.env and /../capability-hub.db
    were downloadable (path traversal);
  - the source archive sat in public/, so it was statically served to anyone while
    the "Leadership-only" endpoint for it returned 401;
  - the Node server bundle was built into dist/, the public web root.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.config import REPO_ROOT

from .conftest import (
    ARCHIVE_BYTES,
    ASSET_JS,
    BAIT_CONTENT,
    BAIT_FILE,
    INDEX_HTML,
    WEB_ROOT,
    raw_get,
)

# Decoded forms - %2e%2e and %2f variants all arrive at the router like this.
TRAVERSALS = [
    "/../secret.env",
    "/assets/../../secret.env",
    "/../../secret.env",
    "/./../secret.env",
    "/....//../secret.env",
]


def test_bait_is_reachable_by_a_naive_join():
    # Proves the fixture is meaningful: an implementation that joined the web root
    # with the requested path, as the vulnerable route did, would reach the bait.
    assert (WEB_ROOT / "../secret.env").resolve() == BAIT_FILE.resolve()
    assert BAIT_FILE.is_file()


@pytest.mark.parametrize("path", TRAVERSALS)
def test_traversal_never_leaves_the_web_root(path):
    status, body = raw_get(path)
    assert BAIT_CONTENT not in body, f"{path} leaked a file outside the web root"
    # Out-of-tree requests are treated like any unknown route: the SPA shell, or a
    # 404 from the static mount. Never the file.
    assert (status == 200 and body == INDEX_HTML) or status == 404, (status, body[:80])


def test_files_inside_the_web_root_are_served(anon):
    response = anon.get("/assets/app.js")
    assert response.status_code == 200
    assert response.content == ASSET_JS


def test_root_and_unknown_routes_get_the_spa_shell(anon):
    assert anon.get("/").content == INDEX_HTML
    assert anon.get("/manager/team").content == INDEX_HTML


def test_root_answers_head_for_platform_probes(anon):
    assert anon.head("/").status_code == 200


def test_health_reports_nothing_security_relevant(anon):
    body = anon.get("/api/health").json()
    assert body["status"] == "ok"
    assert "demoMode" not in body


class TestSourceArchive:
    def test_anonymous_is_refused(self, anon):
        assert anon.get("/api/download-app-zip").status_code == 401

    def test_employee_is_refused(self, employee):
        assert employee.get("/api/download-app-zip").status_code == 403

    def test_leadership_receives_it(self, leadership):
        response = leadership.get("/api/download-app-zip")
        assert response.status_code == 200
        assert response.content == ARCHIVE_BYTES

    def test_it_is_not_reachable_statically(self, anon):
        response = anon.get("/capability_hub_ai_source.zip")
        assert response.content != ARCHIVE_BYTES


class TestRepositoryLayout:
    """Structural guards: keep private artifacts out of the folders that publish."""

    def test_source_archive_is_not_in_public(self):
        # Vite copies public/ verbatim into dist/, the web root.
        assert not (REPO_ROOT / "public" / "capability_hub_ai_source.zip").exists()
        assert (REPO_ROOT / "private" / "capability_hub_ai_source.zip").exists()

    def test_server_bundle_is_not_built_into_the_web_root(self):
        # A server bundle was once written into dist/, publishing server source. The
        # build is now Vite alone; no script may bundle anything else.
        scripts = json.loads((REPO_ROOT / "package.json").read_text("utf-8"))["scripts"]
        assert scripts["build"] == "vite build"
        assert not any("esbuild" in cmd or "--outfile" in cmd for cmd in scripts.values())
