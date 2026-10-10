#!/usr/bin/env python3
"""Fridge Board smoke test. Run: python3 tests/smoke_test.py  (server must be running on :4343)."""
import glob
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import collect  # noqa: E402

PORT = int(os.environ.get("FB_PORT", "4343"))
BASE = f"http://127.0.0.1:{PORT}"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def source_files():
    files = []
    for kid in collect.KIDS.values():
        files += glob.glob(os.path.join(collect.AG, kid["agent"], "**", "*"), recursive=True)
    files += glob.glob(os.path.join(collect.AG, collect.PATH_AGENT, "*"))
    files += glob.glob(os.path.join(collect.HSPT, "**", "*.html"), recursive=True)
    files.append(os.path.join(collect.HSPT, "scholarships", "pipeline.md"))
    return sorted(f for f in files if os.path.isfile(f))


def fingerprint(files):
    out = {}
    for f in files:
        st = os.stat(f)
        h = hashlib.sha256(open(f, "rb").read()).hexdigest()
        out[f] = (h, st.st_mtime_ns, st.st_size)
    return out


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)


def dump_dom(url):
    chrome = shutil.which("google-chrome") or shutil.which("chromium")
    prof = tempfile.mkdtemp(prefix="fbtest-")
    try:
        return subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=3000",
                               f"--user-data-dir={prof}", "--dump-dom", url], capture_output=True, text=True, timeout=60).stdout
    finally:
        shutil.rmtree(prof, ignore_errors=True)


# 1. Read-only: sources unchanged by a collect run
files = source_files()
before = fingerprint(files)
collect.warnings.clear()
board = collect.main()
after = fingerprint(files)
check("sources untouched by collector (sha256 + mtime + size)", before == after and len(files) > 10, f"{len(files)} files")

# 2. Shape
check("both kids present", set(board["kids"]) == {"char", "vic"})
check("HSPT drill sheets parsed", len(board["hspt"]["sheets"]) >= 1, str(len(board["hspt"]["sheets"])))
check("every sheet has a date", all(s["date"] for s in board["hspt"]["sheets"]))
check("check-in runs parsed for both kids", all(k["checkin_count"] > 0 for k in board["kids"].values()))

# 3. Never invent: every curated item verified against its source
check("no unverified items dropped (all curated needles found)", not any("dropped" in w for w in board["warnings"]), "; ".join(board["warnings"]))
cur = json.load(open(os.path.join(HERE, "curated.json")))["items"]
shown = sum(len(k["wins"]) + len(k["focus"]) + len(k["pending"]) + len(k["upcoming"]) + len(k["last_known_list"]) for k in board["kids"].values())
check("every shown item came from curated + verified", shown <= len(cur))

# 4. Gentle framing: focus classes carry no letter or percent anywhere
for kid, k in board["kids"].items():
    for c in (k["classes"] or {}).get("classes", []):
        if c.get("focus"):
            check(f"{kid} {c['subject']} focus area has no grade fields", "letter" not in c and "pct" not in c)
    check(f"{kid} focus items carry no score", all("score" not in f for f in k["focus"]))
    check(f"{kid} no low letter grades in data", all(c.get("letter") not in collect.LOW_LETTERS for c in (k["classes"] or {}).get("classes", [])))

# 5. No chat text copied: short strings only (paths excluded)
long = [s for s in strings({k: v for k, v in board.items() if k != "sources"}) if len(s) > 220]
check("no long text blobs in board data", not long, long[:1])

# 6. Server
try:
    page = urllib.request.urlopen(BASE + "/", timeout=10).read().decode()
    api = json.loads(urllib.request.urlopen(BASE + "/api/board", timeout=30).read())
    hz = urllib.request.urlopen(BASE + "/healthz", timeout=10).read()
    check("server / serves the board", "Fridge Board" in page)
    check("server /api/board returns data", "kids" in api and "hspt" in api)
    check("server /healthz ok", b"ok" in hz)
except Exception as e:
    check("server reachable on :%d" % PORT, False, str(e))

# 7. Rendered pages: no raw failing scores visible, key sections present
RAW_LOW = [r"\bE\s*\(?\d", r"\b30%", r"\b29%", r"\b33%", r"\b67%", r"\b60%", r"\b0/4\b", r"\b0/2\b", r"\b0/5\b", r"\b2/6\b", r"\b6/10\b", r"30/45", r"Missing"]
for route, must in [("home", ["Wins", "Next tiny steps", "Check-ins"]), ("char", ["Class snapshot", "Focus area"]),
                    ("vic", ["Last homework list", "Focus area"]), ("hspt", ["HSPT countdown", "No scores saved yet"]), ("grownups", ["Gaps"])]:
    dom = dump_dom(f"{BASE}/#{route}")
    view = dom.split('id="view"', 1)[-1]
    text = re.sub(r"<[^>]+>", " ", view)
    bad = [p for p in RAW_LOW if re.search(p, text)]
    check(f"#{route} renders key sections", all(m.lower() in text.lower() for m in must), str([m for m in must if m.lower() not in text.lower()]))
    check(f"#{route} shows no raw failing scores", not bad, str(bad))

# 7b. Week-at-a-glance lives above #view (home chrome)
home_dom = dump_dom(f"{BASE}/#home")
check("week-at-a-glance on home", "Week at" in home_dom or "weekglance" in home_dom.lower())

# 8. Offline snapshot
snap = os.path.join(HERE, "dist", "fridge-board-snapshot.html")
if os.path.exists(snap):
    s = open(snap, encoding="utf-8").read()
    check("snapshot is self-contained (no http/https refs)", not re.search(r"https?://", s))
    check("snapshot embeds data", "window.__BOARD__" in s)
    sdom = dump_dom("file://" + snap + "#home")
    check("snapshot renders offline", "Next tiny steps" in sdom)
else:
    check("snapshot exists", False, snap)

# 9. Screenshots at 1280x800 (hero 00-best-home.png required after remaster)
shots = sorted(glob.glob(os.path.join(HERE, "screenshots", "*.png")))
sizes = [struct.unpack(">II", open(p, "rb").read(24)[16:24]) for p in shots]
hero = os.path.join(HERE, "screenshots", "00-best-home.png")
check("hero screenshot 00-best-home.png exists", os.path.isfile(hero))
check("screenshots exist at 1280x800", shots and all(sz == (1280, 800) for sz in sizes), str(sizes))

# 10. Interaction (badge taps, high-five, tabs, no JS errors) via headless Chrome + CDP
if shutil.which("node"):
    p = subprocess.run(["node", "--experimental-websocket", os.path.join(HERE, "tests", "interaction_test.mjs")],
                       capture_output=True, text=True, timeout=120)
    check("interaction test (tests/interaction_test.mjs)", p.returncode == 0, p.stdout[-400:])

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
