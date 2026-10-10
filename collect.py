#!/usr/bin/env python3
"""Fridge Board collector.

Reads the tutor bots' files READ-ONLY and writes data/board.json.
- Never writes to any source. SQLite stores are copied to a private temp dir first,
  so the originals (and their -wal/-shm files) are never opened by us.
- Never invents data: hand-transcribed items in curated.json are only kept when their
  'needle' text is found verbatim in the named source.
- Copies no chat text: only counts, subjects, dates, names, scores and short neutral notes.
"""
import datetime as dt
import glob
import html
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import zoneinfo

HERE = os.path.dirname(os.path.abspath(__file__))
TZ = zoneinfo.ZoneInfo("America/New_York")
AG = os.environ.get("FB_AGENT_ROOT", "/home/box/agent-data/agents")
HSPT = os.environ.get("FB_HSPT_ROOT", "/workspace/hspt")

KIDS = {
    "char": {"agent": "ff5dfcd2-09b9-49dd-952f-14893da73ab0", "routine": "char-weeknight-homework-check-in",
             "name": "Charlotte", "nick": "Char", "grade": "8th grade", "tutor": "Char Tutor", "who": "Charlotte"},
    "vic": {"agent": "7e4990fe-38aa-4d6d-aa6b-c87baad5f8d1", "routine": "vic-weeknight-homework-check-in",
            "name": "Victor", "nick": "Vic", "grade": "6th grade", "tutor": "Vic Tutor", "who": "Vic"},
}
PATH_AGENT = "fd400f67-24e0-40fd-9d9f-fcdcb2969805"

SUBJECT_NORMAL = {
    "religion": "Religion", "rel": "Religion", "ela": "ELA", "algebra 1": "Algebra 1", "algebra": "Algebra 1",
    "science-8": "Science", "science-6": "Science", "science": "Science", "sci": "Science",
    "social studies": "Social Studies", "ss": "Social Studies", "world language": "Spanish", "wl": "Spanish",
    "pe": "PE", "math": "Math",
}
LOW_LETTERS = {"D+", "D", "D-", "E", "F"}

warnings = []


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        warnings.append(f"missing source {path}: {e.strerror}")
        return ""


def read_json(path, default=None):
    t = read_text(path)
    try:
        return json.loads(t) if t else default
    except json.JSONDecodeError:
        warnings.append(f"unreadable json {path}")
        return default


def ms_to_local(ms):
    return dt.datetime.fromtimestamp(ms / 1000, TZ)


def transcript_text(agent_id):
    """Copy store.db (+wal/shm) to a temp dir and pull visible message text. Originals untouched."""
    src = os.path.join(AG, agent_id, "store.db")
    if not os.path.exists(src):
        warnings.append(f"no store.db for {agent_id}")
        return "", None, None
    tmp = tempfile.mkdtemp(prefix="fridge-board-")
    try:
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(src + suffix):
                shutil.copy2(src + suffix, os.path.join(tmp, "store.db" + suffix))
        con = sqlite3.connect(os.path.join(tmp, "store.db"))
        parts, first, last = [], None, None
        for (entry,) in con.execute("select entry from transcript_entries order by seq"):
            j = json.loads(entry)
            ts = j.get("timestampMs")
            if ts:
                first = ts if first is None else min(first, ts)
                last = ts if last is None else max(last, ts)
            if j.get("kind") == "message":
                parts.append(str(j.get("content") or ""))
            elif j.get("kind") == "send-message":
                m = j.get("message") or {}
                if m.get("type") == "text":
                    parts.append(str(m.get("content") or ""))
        con.close()
        return "\n".join(parts), first, last
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def log_lines(text):
    out = []
    for line in text.splitlines():
        m = re.match(r"^- \((\d{4}-\d\d-\d\d)\) (.*)$", line.strip())
        if m:
            out.append((m.group(1), m.group(2)))
    return out


CLASS_RE = re.compile(
    r"\b(Religion|Rel|ELA|Algebra 1|Algebra|Science-8|Science-6|Science|Sci|Social Studies|SS|World Language|WL|PE|Math)"
    r"\s+(?:still\s+)?(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|E|F|CD)\s+(\d{1,3})%?(?=[\s;,.()]|$)")


def class_snapshot(lines, who):
    """Latest log line with >=4 class grades for this kid."""
    best = None
    for logged, body in lines:
        if who not in body or "PowerSchool" not in body:
            continue
        found = {}
        for m in CLASS_RE.finditer(body):
            subj = SUBJECT_NORMAL[m.group(1).lower()]
            found.setdefault(subj, (m.group(2), int(m.group(3))))
        if len(found) >= 4:
            dm = re.match(r"(\d{4}-\d\d-\d\d)", body)
            best = (dm.group(1) if dm else logged, found)
    if not best:
        return None
    date, found = best
    classes = []
    for subj, (letter, pct) in found.items():
        if letter in LOW_LETTERS:
            # Focus area: deliberately drop the letter and percent so they can never be displayed.
            classes.append({"subject": subj, "focus": True})
        elif letter == "CD":
            classes.append({"subject": subj, "credit": True})
        else:
            classes.append({"subject": subj, "letter": letter, "pct": pct})
    return {"as_of": date, "classes": classes}


def report_days(lines, who):
    days = {}
    for logged, body in lines:
        m = re.match(r"(\d{4}-\d\d-\d\d) (Charlotte|Vic)\b(.*)", body)
        if not m or m.group(2) != who:
            continue
        d, rest = m.group(1), m.group(3)
        if "unavailable" in rest:
            days.setdefault(d, "portal-down")
        elif "OneNote" in rest:
            days[d] = days.get(d) if days.get(d) == "report" else "onenote"
            days[d] = "report" if days[d] == "report" else "onenote"
        else:
            days[d] = "report"
    return days


def attendance(lines, who):
    for logged, body in reversed(lines):
        if who not in body:
            continue
        if re.search(r"Attendance 0/0", body):
            return {"absences": 0, "as_of": body[:10]}
        m = re.search(r"(\d+) (?:attendance )?absence", body)
        if m:
            return {"absences": int(m.group(1)), "as_of": body[:10]}
    return None


def runs_for(kid):
    k = KIDS[kid]
    runs = read_json(os.path.join(AG, k["agent"], "automations", k["routine"], "runs.json"), []) or []
    out = []
    for r in runs:
        t = ms_to_local(r["startedAt"])
        out.append({"date": t.strftime("%Y-%m-%d"), "time": t.strftime("%-I:%M %p"), "status": r.get("status"),
                    "trigger": r.get("trigger")})
    return sorted(out, key=lambda r: r["date"])


def best_streak(dates):
    ds = sorted({dt.date.fromisoformat(d) for d in dates})
    best, cur, start, best_range = 0, 0, None, None
    prev = None
    for d in ds:
        if prev and (d - prev).days == 1:
            cur += 1
        else:
            cur, start = 1, d
        if cur > best:
            best, best_range = cur, (start.isoformat(), d.isoformat())
        prev = d
    return best, best_range


def parse_hspt():
    files = {}
    for p in sorted(glob.glob(os.path.join(HSPT, "hspt-day*.html")) + glob.glob(os.path.join(HSPT, "worksheets", "hspt-day*.html"))):
        m = re.search(r"hspt-day(\d+)\.html$", p)
        if m:
            files.setdefault(int(m.group(1)), p)  # root copy wins
    days = []
    for n in sorted(files):
        t = read_text(files[n])
        body = t.split('class="page-break"')[0]
        meta = re.search(r'class="meta">([^<]*)', t)
        meta = html.unescape(meta.group(1)) if meta else ""
        dm = re.search(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Sep|Oct|Nov|Dec) (\d{1,2}), (2026)", meta.split("·")[-1])
        date, inferred = None, False
        if dm:
            date = dt.datetime.strptime(f"{dm.group(2)} {dm.group(3)} {dm.group(4)}", "%b %d %Y").date().isoformat()
        sections = []
        chunks = re.split(r"<h2>", body)[1:]
        for c in chunks:
            title = html.unescape(re.sub(r"<[^>]+>", "", c.split("</h2>")[0])).strip()
            diff = re.search(r'class="diff">([^<]*)', c)
            diff = html.unescape(diff.group(1)).strip() if diff else ""
            title = title.replace(diff, "").strip()
            area = title.split("—")[0].split(" ")[0].strip()
            sections.append({"area": area, "label": title, "difficulty": diff, "questions": len(re.findall(r"<li>", c))})
        pdf = os.path.exists(os.path.join(HSPT, "worksheets", f"HSPT-Day-{n}.pdf"))
        days.append({"day": n, "date": date, "date_inferred": inferred, "sections": sections,
                     "questions": sum(s["questions"] for s in sections), "pdf": pdf})
    # Day 1 carries no date: infer it only when Day 2 is dated (sheets are daily).
    for i, d in enumerate(days):
        if not d["date"] and i + 1 < len(days) and days[i + 1]["date"] and days[i + 1]["day"] == d["day"] + 1:
            d["date"] = (dt.date.fromisoformat(days[i + 1]["date"]) - dt.timedelta(days=1)).isoformat()
            d["date_inferred"] = True
    areas = {}
    for d in days:
        for s in d["sections"]:
            areas[s["area"]] = areas.get(s["area"], 0) + s["questions"]
    # Score logs: Path keeps none on this box today. Look for any, never fabricate.
    score_files = [p for p in glob.glob(os.path.join(HSPT, "**", "*"), recursive=True)
                   if re.search(r"(score|graded|results)", os.path.basename(p), re.I)]
    streak, rng = best_streak([d["date"] for d in days if d["date"]])
    return {"sheets": days, "area_questions": areas, "total_questions": sum(d["questions"] for d in days),
            "scores": [], "score_files_found": [os.path.relpath(p, HSPT) for p in score_files],
            "daily_streak": streak, "streak_range": rng}


def main():
    now = dt.datetime.now(TZ)
    today = now.date()
    curated = read_json(os.path.join(HERE, "curated.json"), {"items": []})

    sources = {}
    kid_lines = {}
    for kid, k in KIDS.items():
        base = os.path.join(AG, k["agent"])
        sources[f"{kid}_log"] = read_text(os.path.join(base, "memory", "log", "2026-09.md"))
        # pick up any later monthly logs too
        for extra in sorted(glob.glob(os.path.join(base, "memory", "log", "*.md"))):
            if not extra.endswith("2026-09.md"):
                sources[f"{kid}_log"] += "\n" + read_text(extra)
        txt, first, last = transcript_text(k["agent"])
        sources[f"{kid}_transcript"] = txt
        k["_tx_range"] = (first, last)
        kid_lines[kid] = log_lines(sources[f"{kid}_log"])
    path_profile = read_json(os.path.join(AG, PATH_AGENT, "profile.json"), {}) or {}
    sources["path_profile"] = path_profile.get("description", "")
    sources["path_pipeline"] = read_text(os.path.join(HSPT, "scholarships", "pipeline.md"))

    items, dropped = [], []
    for it in curated.get("items", []):
        src = sources.get(it["source"], "")
        if it.get("needle") and it["needle"] in src:
            clean = {k: v for k, v in it.items() if k != "needle"}
            items.append(clean)
        else:
            dropped.append(f"{it['kid']}:{it['name']} (needle not found in {it['source']})")
    if dropped:
        warnings.append("dropped unverified items: " + "; ".join(dropped))

    kids_out = {}
    for kid, k in KIDS.items():
        lines = kid_lines[kid]
        runs = runs_for(kid)
        rdays = report_days(lines, k["who"])
        cal = {}
        for r in runs:
            cal.setdefault(r["date"], {"run": False, "report": None})
            cal[r["date"]]["run"] = r["status"] == "ok"
        for d, s in rdays.items():
            cal.setdefault(d, {"run": False, "report": None})
            cal[d]["report"] = s
        streak, rng = best_streak([d for d, v in cal.items() if v["run"] or v["report"] in ("report", "onenote")])
        mine = [i for i in items if i["kid"] == kid]
        subj_counts = {}
        for i in mine:
            if i["kind"] in ("win", "focus", "pending", "due", "test"):
                subj_counts[i["subject"]] = subj_counts.get(i["subject"], 0) + 1
        snap = class_snapshot(lines, k["who"])
        if snap:
            for c in snap["classes"]:
                subj_counts.setdefault(c["subject"], 0)
        first, last = k["_tx_range"]
        all_dates = sorted(set(list(cal.keys())))
        last_logged = max([d for d in all_dates] + ([ms_to_local(last).strftime("%Y-%m-%d")] if last else []))
        upcoming = sorted([i for i in mine if i["kind"] in ("test", "due", "event") and i.get("due") and i["due"] >= today.isoformat()],
                          key=lambda i: i["due"])
        past_due = sorted([i for i in mine if i["kind"] in ("test", "due") and (not i.get("due") or i["due"] < today.isoformat())],
                          key=lambda i: i.get("due") or i["date"])
        kids_out[kid] = {
            "name": k["name"], "nick": k["nick"], "grade": k["grade"], "tutor": k["tutor"],
            "checkins": runs, "calendar": cal, "best_streak": streak, "streak_range": rng,
            "checkin_count": sum(1 for r in runs if r["status"] == "ok"),
            "report_count": sum(1 for v in rdays.values() if v in ("report", "onenote")),
            "portal_down_days": sorted(d for d, v in rdays.items() if v == "portal-down"),
            "wins": [i for i in mine if i["kind"] == "win"],
            "focus": [i for i in mine if i["kind"] == "focus"],
            "pending": [i for i in mine if i["kind"] == "pending"],
            "upcoming": upcoming, "last_known_list": past_due,
            "subjects": sorted(({"subject": s, "count": n} for s, n in subj_counts.items()), key=lambda x: (-x["count"], x["subject"])),
            "classes": snap, "attendance": attendance(lines, k["who"]),
            "data_range": {"first": all_dates[0] if all_dates else None, "last": last_logged},
            "days_since_last": (today - dt.date.fromisoformat(last_logged)).days if last_logged else None,
        }

    hspt = parse_hspt()
    test_day = dt.date(2026, 11, 17) if "Nov 17, 2026" in sources["path_profile"] else None
    hspt["test_day"] = test_day.isoformat() if test_day else None
    hspt["days_to_test"] = (test_day - today).days if test_day else None

    badges = build_badges(kids_out, hspt)

    out = {
        "generated_at": now.isoformat(timespec="seconds"),
        "today": today.isoformat(),
        "kids": kids_out,
        "hspt": hspt,
        "badges": badges,
        "sources": [
            {"label": "Char Tutor memory log + routine runs + visible messages (counts only)", "path": f"{AG}/{KIDS['char']['agent']}/"},
            {"label": "Vic Tutor memory log + routine runs + visible messages (counts only)", "path": f"{AG}/{KIDS['vic']['agent']}/"},
            {"label": "Path profile (HSPT test day)", "path": f"{AG}/{PATH_AGENT}/profile.json"},
            {"label": "Path HSPT drill sheets", "path": f"{HSPT}/hspt-day*.html, {HSPT}/worksheets/"},
            {"label": "Path scholarship pipeline (Open House date)", "path": f"{HSPT}/scholarships/pipeline.md"},
        ],
        "gaps": build_gaps(kids_out, hspt, today),
        "warnings": warnings,
    }
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    tmp = os.path.join(HERE, "data", "board.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    os.replace(tmp, os.path.join(HERE, "data", "board.json"))
    return out


def build_badges(kids, hspt):
    b = {"char": [], "vic": []}
    for kid, k in kids.items():
        if k["best_streak"] >= 3:
            b[kid].append({"icon": "🔥", "title": f"{k['best_streak']}-night streak",
                           "why": f"Tutor check-ins every night, {fmt(k['streak_range'][0])} to {fmt(k['streak_range'][1])}"})
        perfect = [w for w in k["wins"] if "/" in w.get("score", "") and all(
            a == b2 for a, b2 in (s.split("/") for s in re.findall(r"\d+/\d+", w["score"])))]
        if perfect:
            b[kid].append({"icon": "💯", "title": f"{len(perfect)} perfect score{'s' if len(perfect) != 1 else ''}",
                           "why": ", ".join(w["name"] for w in perfect)})
        if k["classes"]:
            tops = [c["subject"] for c in k["classes"]["classes"] if c.get("letter", "").startswith("A")]
            if len(tops) >= 2:
                b[kid].append({"icon": "🅰️", "title": f"A-Team: {len(tops)} classes",
                               "why": ", ".join(tops) + f" (as of {fmt(k['classes']['as_of'])})"})
        if k["attendance"] and k["attendance"]["absences"] == 0:
            b[kid].append({"icon": "🌞", "title": "Perfect attendance", "why": f"No absences as of {fmt(k['attendance']['as_of'])}"})
        for w in k["wins"]:
            m = re.match(r"(\d+)/(\d+)$", w.get("score", ""))
            if m and "test" in w["name"].lower() and int(m.group(1)) / int(m.group(2)) >= 0.9:
                b[kid].append({"icon": "🏆", "title": "Test champ", "why": f"{w['name']}: {w['score']}"})
    if hspt["daily_streak"] >= 3:
        b["char"].append({"icon": "🧭", "title": f"{len(hspt['sheets'])} HSPT practice days",
                          "why": f"Path made a fresh sheet every day, {fmt(hspt['streak_range'][0])} to {fmt(hspt['streak_range'][1])}"})
    return b


def build_gaps(kids, hspt, today):
    g = []
    for kid, k in kids.items():
        if k["data_range"]["last"]:
            g.append(f"{k['nick']}: the tutor's notes on this computer end {fmt(k['data_range']['last'])} "
                     f"({k['days_since_last']} days ago). Nothing after that is shown.")
        if not k["upcoming"]:
            g.append(f"{k['nick']}: no upcoming tests or assignments are logged.")
    if not kids["char"]["last_known_list"]:
        g.append("Char: her OneNote homework list was never saved to the tutor's notes, so there are no assignment due dates for her.")
    if not hspt["scores"]:
        g.append("HSPT: practice sheets are saved, but no scores are logged anywhere on this computer.")
    g.append("PowerSchool: no separate grade-pull files on this computer. Grades come from the tutors' own notes.")
    return g


def fmt(iso):
    if not iso:
        return "?"
    d = dt.date.fromisoformat(iso)
    return d.strftime("%b %-d")


if __name__ == "__main__":
    out = main()
    if "-q" not in sys.argv:
        print(json.dumps({k: out[k] for k in ("generated_at", "gaps", "warnings")}, indent=1, ensure_ascii=False))
