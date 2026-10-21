"""Gemini endpoint probes.

Every AI route is built to degrade: on a missing key or a failed call it returns
deterministic fallback text with HTTP 200, so the UI always gets an answer. That
means a passing smoke test proves nothing about the real integration - the
fallback would pass it too.

This script therefore asserts the *opposite*: that generation actually happened.
Each check looks for the fallback fingerprint and fails if it is present.

Requires GEMINI_API_KEY in the repo-root .env, and a restart of whichever backend
is being probed (the key is read at startup).

    python backend/scripts/verify_ai.py                       # defaults to :8000
    python backend/scripts/verify_ai.py https://staging.example.com
"""
from __future__ import annotations

import http.cookiejar
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "capability-hub.db"

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8000"
MGR = {"identifier": "marcus.sterling@capabilityhub.ai", "password": "mgr-demo-pass"}

# Substrings that appear ONLY in the hand-written fallbacks in routers/agents.py
# and routers/demand.py. If any of these come back, the model was not reached.
#
# Kept in sync with those fallbacks by the self-test at the bottom of this file -
# an assertion that passes on fallback output is worse than no assertion at all.
FALLBACK_MARKERS = [
    # orchestrator personas
    "### SkillGap-to-Growth Analysis (Intelligent Agent)",
    "### Learning Concierge",
    "### Manager GROW Coach",
    "### Capability Analytics",
    "I was unable to reach the model",
    # manager insight
    "• Strength:",
    "Coaching Question (GROW):",
    # interview evaluation
    "Model evaluation unavailable",
    # post-assessment
    "Post-Training GROW Readiness Assessment for",
]

failures: list[str] = []
notes: list[str] = []

opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def call(method: str, path: str, body=None, timeout: int = 90):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, None
    except urllib.error.URLError as e:
        print("  cannot reach " + BASE + ": " + str(e.reason))
        sys.exit(2)


def looks_like_fallback(payload) -> bool:
    if isinstance(payload, dict) and payload.get("_fallback"):
        return True
    # ensure_ascii=False matters: json.dumps would otherwise escape "•" to
    # "•" and the bullet-prefixed markers would never match.
    blob = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return any(m in blob for m in FALLBACK_MARKERS)


def check(label: str, status: int, payload, want_status: int = 200,
          shape: list[str] | None = None, container: str | None = None) -> None:
    target = payload
    if container and isinstance(payload, dict):
        target = payload.get(container)

    problems = []
    if status != want_status:
        problems.append("status " + str(status) + " (wanted " + str(want_status) + ")")
    if looks_like_fallback(target):
        problems.append("returned the FALLBACK, not generated output")
    if shape and isinstance(target, dict):
        missing = [k for k in shape if k not in target]
        if missing:
            problems.append("missing keys " + str(missing))
    elif shape and not isinstance(target, dict):
        problems.append("expected an object, got " + type(target).__name__)

    ok = not problems
    print("  [" + ("PASS" if ok else "FAIL") + "] " + label
          + ("" if ok else "  -> " + "; ".join(problems)))
    if not ok:
        failures.append(label + ": " + "; ".join(problems))


def preview(payload, container=None, key=None, n=110) -> str:
    v = payload
    if container and isinstance(v, dict):
        v = v.get(container)
    if key and isinstance(v, dict):
        v = v.get(key)
    s = v if isinstance(v, str) else json.dumps(v)
    s = " ".join(str(s).split())
    return s[:n] + ("..." if len(str(s)) > n else "")


# Self-test: the detector must recognise the real fallback strings, otherwise a
# keyless run would report success. Verified before any endpoint is probed.
_SAMPLES = [
    {"response": "### SkillGap-to-Growth Analysis (Intelligent Agent)\nBased on..."},
    {"insight": "• Strength: Aarav has demonstrated core proficiency..."},
    {"evaluation": {"feedback": "Model evaluation unavailable, so this is..."}},
    {"_fallback": True},
]
for i, sample in enumerate(_SAMPLES):
    if not looks_like_fallback(sample):
        print("ABORT: fallback detector failed its own self-test on sample "
              + str(i) + " - it would report false passes. Fix FALLBACK_MARKERS.")
        sys.exit(3)

print("Probing " + BASE)
print("Fallback detector self-test: passed (" + str(len(_SAMPLES)) + " samples)")
print("NOTE: outputs are model-generated, so content differs run to run and")
print("      between backends. These checks assert shape and non-fallback only.\n")

status, _ = call("POST", "/api/auth/login", MGR)
if status != 200:
    print("  cannot authenticate as manager (" + str(status) + ") - aborting")
    sys.exit(2)

# --------------------------------------------------------------------------- #
print("Text generation")

for agent in ("skill_gap", "concierge", "coach", "analytics"):
    s, b = call("POST", "/api/ai/orchestrator", {
        "userId": "E1000",
        "prompt": "In two sentences, what should this person focus on next?",
        "agent": agent,
    })
    check("orchestrator / " + agent, s, b, shape=["response"])
    print("        " + preview(b, key="response"))

s, b = call("POST", "/api/manager/insight", {"employeeId": "E1000"})
check("manager/insight", s, b, shape=["insight"])
print("        " + preview(b, key="insight"))

# --------------------------------------------------------------------------- #
print("\nStructured JSON generation (exercises generate_json fence-stripping)")

s, b = call("POST", "/api/agent/generate-jd-assessment", {
    "targetRole": "Senior Full-Stack AI Engineer",
    "jobDescription": (
        "Build an AI-assisted banking portal in Next.js and TypeScript over Java "
        "and Spring Boot microservices, integrating the Gemini API for a customer "
        "assistant with retrieval over PostgreSQL."
    ),
})
check("agent/generate-jd-assessment", s, b, container="assessment",
      shape=["roleTitle", "mcqs", "videoQuestions"])
if isinstance(b, dict) and isinstance(b.get("assessment"), dict):
    a = b["assessment"]
    print("        roleTitle=" + str(a.get("roleTitle"))
          + "  mcqs=" + str(len(a.get("mcqs") or []))
          + "  videoQuestions=" + str(len(a.get("videoQuestions") or [])))

s, b = call("POST", "/api/agent/evaluate-interview-answer", {
    "jobDescription": "Senior Full-Stack AI Engineer, Java/Spring Boot + Next.js + Gemini.",
    "questionTitle": "Retrieval design",
    "questionText": "How would you ground an LLM assistant in customer account data?",
    "keyRubrics": ["Retrieval grounding", "Guardrails", "Latency awareness"],
    "candidateAnswer": (
        "I'd embed the account and product documents into pgvector, retrieve the "
        "top-k passages per query, and pass them as context with strict system "
        "instructions to answer only from provided context. For guardrails I'd "
        "refuse financial advice and log every unanswered query for review. To "
        "keep latency down I'd cache embeddings and stream the response."
    ),
})
check("agent/evaluate-interview-answer", s, b, container="evaluation",
      shape=["overallScore", "technicalScore", "communicationScore", "feedback"])
if isinstance(b, dict) and isinstance(b.get("evaluation"), dict):
    e = b["evaluation"]
    print("        overall=" + str(e.get("overallScore"))
          + " technical=" + str(e.get("technicalScore"))
          + " communication=" + str(e.get("communicationScore")))
    print("        " + preview(b, container="evaluation", key="feedback"))

s, b = call("POST", "/api/project-demand/parse-jd", {
    "jobDescriptionText": (
        "Aurora Health is hiring 3 Data Engineers for a Sydney-based hybrid "
        "engagement, 5-9 years experience. Must have Python, Spark, Databricks and "
        "Azure Data Factory. Nice to have: healthcare domain, SQL tuning. Client "
        "interviews start 2026-10-05."
    ),
})
check("project-demand/parse-jd", s, b, container="parsed",
      shape=["projectName", "requiredSkills", "experienceRangeMin", "domain"])
if isinstance(b, dict) and isinstance(b.get("parsed"), dict):
    p = b["parsed"]
    print("        project=" + str(p.get("projectName"))
          + "  customer=" + str(p.get("customerName")))
    print("        required=" + str(p.get("requiredSkills"))
          + "  exp=" + str(p.get("experienceRangeMin")) + "-"
          + str(p.get("experienceRangeMax")))

# --------------------------------------------------------------------------- #
print("\nPersisting generation (post-assessment writes a row; restored after)")

with sqlite3.connect(DB) as c:
    before_ids = {r[0] for r in c.execute("SELECT id FROM post_assessments")}

s, b = call("POST", "/api/manager/post-assessment",
            {"employeeId": "E1000", "demandId": "OPP-1015"})
check("manager/post-assessment", s, b, shape=["assessment", "narrative"])
print("        " + preview(b, key="narrative"))

with sqlite3.connect(DB) as c:
    after_ids = {r[0] for r in c.execute("SELECT id FROM post_assessments")}
    created = after_ids - before_ids
    for pid in created:
        c.execute("DELETE FROM post_assessments WHERE id = ?", (pid,))
    c.commit()
    final = {r[0] for r in c.execute("SELECT id FROM post_assessments")}
print("        created " + str(len(created)) + " row(s), removed; table back to "
      + str(len(final)) + " (was " + str(len(before_ids)) + ")")
if final != before_ids:
    failures.append("post_assessments not restored")

# --------------------------------------------------------------------------- #
print("\nNot exercised here")
print("  project-demand/generate-client-resume - gated on a completed track,")
print("  manager sign-off and measured skill growth, so it returns 403 before")
print("  ever reaching the model. Covered by verify_stage34 instead.")

print()
if failures:
    print(str(len(failures)) + " FAILED")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("All AI endpoints produced real generated output (no fallbacks).")
