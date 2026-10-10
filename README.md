# Boyd Fridge Board 🧲

A warm, kid-friendly progress board for **Char** (8th grade) and **Vic** (6th grade), sized for a kitchen tablet
(1280×800 landscape). It's built only from what the family's tutor bots have already saved on this computer.

- **Live app:** http://127.0.0.1:4343 (local only)
- **Offline snapshot:** `dist/fridge-board-snapshot.html`. One self-contained file with no network calls. Open it in any browser.
- **Screenshots:** `screenshots/00-best-home.png` (hero) plus `01-home` … `06-offline-snapshot` (1280×800 kitchen tablet)

## What's on it

| Tab | What it shows |
|---|---|
| 🏠 Home | Week-at-a-glance + both kids side by side: animated streak flames, logged check-in week (★ / ☁), top wins, "Next tiny steps", coming up, HSPT countdown. Badge icons in each kid header. Optional "since last open" strip. |
| Char / Vic | Check-in calendar (Sep–Oct), class snapshot (letters only; low classes show as **🌱 Focus area**), subjects in the tutor notes, every badge, wins, next tiny steps, work waiting for a grade, coming up, and Vic's last saved homework list (marked as past). |
| 🧭 HSPT | Path's prep for Char: countdown to **Tue Nov 17, 2026 (SJE)**, a "trail" of every practice sheet Path has made plus the days left, questions per HSPT area, difficulty of the latest sheets, key dates (Spalding Open House Oct 25), and the practice-score area. It's empty for now because no scores are logged. |
| ☕ Grown-ups | Sources, gaps, letter grades with percentages for classes that aren't focus areas, attendance, and each kid's check-in log with outcomes. |

Fun bits: tap a badge for confetti and the reason it was earned. Tap a kid's avatar to give a 🙌 high five (the count is kept
on that device only). New wins get a cheer the first time the board sees them. **Slideshow** in the footer rotates the tabs
every 40 s for an always-on screen. The screen dims from 9 PM to 6 AM.

## What's new (Sat Oct 10 afternoon remaster)

* **Warmer fridge aesthetic** for 1280×800 kitchen tablets: soft door frame, magnet letter tiles, clearer Char/Vic kid cards, animated streak 🔥 flames, richer confetti (rectangles + circles + triangles).
* **Week-at-a-glance strip** across the top: every logged check-in night for both kids (Char / Vic / both), with ★ / ☁ marks from the tutor notes only.
* **"Since last open" delta** (device-local): surfaces new check-ins, wins, or HSPT sheets since the last visit on this tablet — never invents grades.
* **Badge shelf remaster** on kid tabs: magnets on a wooden shelf rail; tap still confettis the reason.
* **HSPT trail polish**: filling path behind the stones, bobbing finish flag, smoother countdown ring.
* **Slideshow polish**: progress bar under the header while the 40 s kiosk rotation runs.
* **Print-friendly CSS** (`@media print`) so a parent can print Home / Char / Vic without chrome.
* Collector re-run against live tutor + Path sources (copy-to-temp SQLite pattern unchanged). Offline `dist/fridge-board-snapshot.html` via `build_snapshot.py` or `export_static.py`. Fresh `screenshots/00-best-home.png`.

## Rules it follows

- **Read-only.** The collector never writes to any source. The bots' SQLite stores are *copied* to a temp dir and read
  there, so the originals and their `-wal`/`-shm` files are never opened. The smoke test checks sha256 + mtime + size of
  every source file before and after a collect.
- **Never invents.** Counts, streaks, check-in days, class snapshots and HSPT sheets are parsed straight from the files.
  The individual graded and due items are hand-transcribed in `curated.json`. Each one has a `needle` that must appear
  **verbatim** in its source, or it's dropped and listed under "Collector warnings".
- **No chat text.** Only counts, subjects, dates, assignment names, scores for wins, and short neutral notes.
- **Gentle framing.** For a class at D/E/F, the collector removes the letter and percent before the data reaches the
  page. It only ever appears as "🌱 Focus area" with a next step. Raw low scores are never shown, and the smoke test checks every rendered tab for them.
- **Private.** The server binds to 127.0.0.1, the pages use no CDN, web fonts or analytics, and nothing is sent anywhere.

## Sources (all read-only)

| Source | Used for |
|---|---|
| `/home/box/agent-data/agents/ff5dfcd2-…/memory/log/2026-09.md` (Char Tutor) | grade snapshots, newly graded items, attendance, report days |
| `…/ff5dfcd2-…/automations/char-weeknight-homework-check-in/runs.json` | check-in nights + times |
| `…/ff5dfcd2-…/store.db` (copied, visible messages only) | verifying a couple of items (e.g. Summer Work Presentation 5/5) |
| `/home/box/agent-data/agents/7e4990fe-…/` (Vic Tutor): same three | same, plus Vic's OneNote homework/test list from Sep 15 |
| `/home/box/agent-data/agents/fd400f67-…/profile.json` (Path) | HSPT test day |
| `/workspace/hspt/hspt-day*.html`, `/workspace/hspt/worksheets/` | the practice sheets (currently 23) (date, areas, difficulty, question count) |
| `/workspace/hspt/scholarships/pipeline.md` | Spalding Open House date |

## Known gaps (shown on the Grown-ups tab)

- The tutor notes on this computer run **Sep 9 to Sep 15, 2026** only. Nothing later is shown, and the board says so.
- Char's OneNote homework list was never saved to her tutor's notes, so she has no assignment due dates.
- Vic's last saved homework and test list is from Sep 15, so all of it is past. "Coming up" shows an empty state for him.
- No HSPT practice scores are logged anywhere. The board counts sheets *made*, not sheets completed.
- There are no separate PowerSchool grade-pull files on the box. Grades come from the tutors' own notes.
- Day 1's HSPT sheet has no date printed on it, so it's shown as Sep 18 (the day before Day 2) and marked as inferred.

## Run it

```bash
./run.sh                          # start in the background on 127.0.0.1:4343 (log: data/server.log)
./stop.sh                         # stop
python3 collect.py                # re-collect now (the server also re-collects every 10 min, or GET /api/refresh)
python3 build_snapshot.py         # rebuild dist/fridge-board-snapshot.html
./screenshot.sh                   # re-capture screenshots/ at 1280x800
python3 tests/smoke_test.py       # smoke test (server must be running), includes tests/interaction_test.mjs
```

Env overrides: `FB_PORT`, `FB_HOST` (keep 127.0.0.1 unless you mean to share it on a network), `FB_MAX_AGE`,
`FB_AGENT_ROOT`, `FB_HSPT_ROOT`.

**Adding new items:** when the tutors save new check-ins, the streaks, calendars, class snapshots and HSPT trail update
by themselves. To add a newly graded or due item, add a line to `curated.json` with a `needle` copied from the tutor's
memory log. The collector won't show it unless it finds that text.

## Files

```
collect.py            reads sources -> data/board.json (read-only, verified)
curated.json          hand-transcribed items, each with a verbatim source needle
server.py             stdlib HTTP server (127.0.0.1:4343)
web/                  index.html, app.css, app.js (no dependencies)
build_snapshot.py     -> dist/fridge-board-snapshot.html
screenshot.sh         headless Chrome screenshots
tests/smoke_test.py   read-only, never-invent, gentle-framing, server, snapshot and screenshot checks
tests/interaction_test.mjs  CDP-driven taps (badges, high five, tabs, slideshow) + JS error check
```


---
## Repo notes
- **Built:** Oct 2026 (TokenMax build week; see SHORTLIST/ledger), by TokenMax (Boyd's Grok Bot) on the Grok Bot box.
- **Run:** `./run.sh` (then open the localhost URL it prints).
- Imported from `/workspace/tokenmax/fridge-board` on Oct 23, 2026. node_modules, virtualenvs, logs and files over 20 MB were left out.
