/* Boyd Fridge Board: a kid-friendly view over the tutor bots' notes. Local only, read-only.
   Remastered Sat Oct 10 afternoon — warmer fridge UI, week glance, since-last-open, badge shelf. */
(function () {
  "use strict";
  var D = null;
  var SNAP = !!window.__BOARD__;
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var SUBJ_IC = {"ELA":"📖","Science":"🔬","Spanish":"🗣️","Math":"➗","Algebra 1":"➗","Religion":"✝️","Social Studies":"🏛️","PE":"⚽","HSPT":"🧭","High school":"🏫"};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function $(s) { return document.querySelector(s); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(s) { if (!s) return ""; var d = parse(s); return MONTHS[d.getMonth()] + " " + d.getDate(); }
  function fmtDow(s) { var d = parse(s); return DOW[d.getDay()] + " " + MONTHS[d.getMonth()] + " " + d.getDate(); }
  function today() { return new Date(new Date().toDateString()); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function ic(subj) { return SUBJ_IC[subj] || "⭐"; }

  /* ---------- title magnets ---------- */
  function magnets() {
    var cols = ["#e85d75","#f5a623","#2fb67c","#4aa3e8","#7c5cd6","#f08a24","#1f9e8f"];
    var t = "BOYD FRIDGE BOARD", h = "";
    for (var i = 0; i < t.length; i++) {
      if (t[i] === " ") { h += '<span class="sp"></span>'; continue; }
      var rot = ((i * 37) % 9) - 4;
      h += '<span style="color:' + cols[i % cols.length] + ';transform:rotate(' + rot + 'deg)">' + t[i] + "</span>";
    }
    $("#title").innerHTML = h;
  }

  function clock() {
    var n = new Date();
    $("#clock-time").textContent = n.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
    $("#clock-date").textContent = n.toLocaleDateString([], {weekday: "long", month: "short", day: "numeric"});
    var h = n.getHours();
    document.body.classList.toggle("dim", (h >= 21 || h < 6) && !SNAP);
  }

  /* ---------- pieces ---------- */
  function empty(emoji, text) { return '<div class="empty"><span class="e">' + emoji + "</span><span>" + text + "</span></div>"; }

  function winList(items, max) {
    if (!items.length) return empty("🌟", "No wins saved yet. They'll show up here.");
    return '<ul class="list">' + items.slice(0, max || 99).map(function (w) {
      return '<li><span class="ic">' + ic(w.subject) + '</span><span class="tx"><b>' + esc(w.name) + "</b> " +
        (w.score ? '<span class="pill gold">⭐ ' + esc(w.score) + "</span>" : "") +
        '<span class="meta">' + esc(w.subject) + " · " + fmt(w.date) + "</span></span></li>";
    }).join("") + "</ul>";
  }

  function focusList(items, max, kid) {
    if (!items.length) return empty("🌈", "Nothing to work on right now. Nice!");
    return '<ul class="list focus">' + items.slice(0, max || 99).map(function (f) {
      return '<li><span class="ic">🌱</span><span class="tx"><b>' + esc(f.subject) + ":</b> " + esc(f.name) +
        '<br><span class="step">' + esc(f.step || "Ask a grown-up to help") + "</span>" +
        '<span class="meta">from the ' + fmt(f.date) + " check-in</span></span></li>";
    }).join("") + "</ul>";
  }

  function upcomingList(kid, max) {
    var k = D.kids[kid], t = today(), out = [];
    k.upcoming.forEach(function (u) {
      var n = daysBetween(t, parse(u.due));
      if (n < 0) return;
      out.push('<li><span class="ic">' + (u.kind === "test" ? "📝" : u.kind === "event" ? "🏫" : "📌") + '</span><span class="tx"><b>' + esc(u.name) +
        '</b> <span class="pill ' + kid + '">' + (n === 0 ? "today" : "in " + n + " day" + (n === 1 ? "" : "s")) + "</span>" +
        '<span class="meta">' + fmtDow(u.due) + "</span></span></li>");
    });
    if (!out.length) return empty("📭", "No upcoming tests or homework are logged. The tutor's last list was from " + fmt(k.data_range.last) + ".");
    return '<ul class="list">' + out.slice(0, max || 99).join("") + "</ul>";
  }

  function badgeRow(kid, compact) {
    var b = D.badges[kid] || [];
    if (!b.length) return empty("🎖️", "Badges unlock as check-ins are saved.");
    var inner = '<div class="badges">' + b.slice(0, compact ? 4 : 99).map(function (x, i) {
      return '<button class="badge ' + kid + ' pop" style="animation-delay:' + (i * 0.08) + 's" data-why="' + esc(x.why) + '" data-title="' + esc(x.icon + " " + x.title) + '"><span class="bi">' + x.icon + "</span>" + esc(x.title) + "</button>";
    }).join("") + "</div>";
    if (compact) return inner;
    return '<div class="badge-shelf"><div class="shelf-label">🧲 Badge magnets</div>' + inner + "</div>";
  }

  function strip(kid) {
    var k = D.kids[kid], days = Object.keys(k.calendar).sort();
    if (!days.length) return empty("🗓️", "No check-ins saved yet.");
    return '<div class="strip" style="--kc:var(--' + kid + ')">' + days.map(function (d) {
      var c = k.calendar[d], on = c.run || c.report === "report" || c.report === "onenote";
      var mark = c.report === "report" || c.report === "onenote" ? "★" : c.report === "portal-down" ? "☁" : "✓";
      return '<div class="d ' + (on ? "on " : "") + (c.report === "report" ? "star" : "") + '"><i>' + (on ? mark : "") + "</i>" + DOW[parse(d).getDay()].slice(0, 2) + " " + parse(d).getDate() + "</div>";
    }).join("") + "</div>";
  }

  function freshLine(kid) {
    var k = D.kids[kid], n = daysBetween(parse(k.data_range.last), today());
    return '<div class="small muted" style="margin-top:8px">★ = grade report saved · ☁ = school site was down' +
      (n > 2 ? ' · <b style="color:var(--ink)">Nothing saved since ' + fmt(k.data_range.last) + "</b>" : "") + "</div>";
  }

  function flameHtml(n) {
    return '<span class="flame" aria-hidden="true">🔥</span> ' + n;
  }

  function kidHead(kid) {
    var k = D.kids[kid], b = D.badges[kid] || [];
    var mini = b.map(function (x) {
      return '<button class="badge mini ' + kid + '" title="' + esc(x.title) + '" data-why="' + esc(x.why) + '" data-title="' + esc(x.icon + " " + x.title) + '"><span class="bi">' + x.icon + "</span></button>";
    }).join("");
    return '<div class="kidhead ' + kid + '"><button class="avatar hi5" data-kid="' + kid + '" title="Tap for a high five">' + esc(k.nick[0]) + '</button><div><div class="nm">' + esc(k.nick) +
      '</div><div class="sub">' + esc(k.grade) + " · " + k.checkin_count + " check-ins · " + k.wins.length + " wins saved" + hi5Count(kid) + "</div></div>" +
      '<div class="minib">' + mini + "</div>" +
      '<div class="streak"><div class="n">' + flameHtml(k.best_streak) + '</div><div class="l">night streak</div></div></div>';
  }

  /* ---------- week-at-a-glance (logged check-in week, both kids) ---------- */
  function weekGlance() {
    var el = $("#weekglance");
    if (!el || !D) return;
    var all = {};
    ["char", "vic"].forEach(function (kid) {
      Object.keys(D.kids[kid].calendar).forEach(function (d) {
        var c = D.kids[kid].calendar[d];
        if (c.run || c.report === "report" || c.report === "onenote" || c.report === "portal-down") all[d] = true;
      });
    });
    var days = Object.keys(all).sort();
    if (!days.length) { el.hidden = true; return; }
    var t = iso(today());
    var cells = days.map(function (d) {
      var ch = D.kids.char.calendar[d], vi = D.kids.vic.calendar[d];
      var con = ch && (ch.run || ch.report === "report" || ch.report === "onenote" || ch.report === "portal-down");
      var von = vi && (vi.run || vi.report === "report" || vi.report === "onenote" || vi.report === "portal-down");
      var cls = "wd" + (con && von ? " on-both" : con ? " on-char" : von ? " on-vic" : "") + (d === t ? " today" : "");
      var mk = "";
      if (con && von) mk = "✓";
      else if (con) mk = "💜";
      else if (von) mk = "🧡";
      var chRep = ch && (ch.report === "report" || ch.report === "onenote");
      var viRep = vi && (vi.report === "report" || vi.report === "onenote");
      if (chRep || viRep) mk = "★";
      if ((ch && ch.report === "portal-down") || (vi && vi.report === "portal-down")) {
        if (!chRep && !viRep) mk = "☁";
      }
      var dd = parse(d);
      return '<div class="' + cls + '" title="' + fmtDow(d) + '"><div class="dn">' + DOW[dd.getDay()].slice(0, 2) + '</div><div class="dd">' + dd.getDate() + '</div><div class="mk">' + mk + "</div></div>";
    }).join("");
    el.innerHTML = '<div class="wl">Week at<br>a glance</div><div class="wdays">' + cells + "</div>" +
      '<div class="small muted" style="grid-column:1/-1;margin:0">💜 Char · 🧡 Vic · ★ grade report · ☁ portal down · logged nights only (tutor notes)</div>';
    el.hidden = false;
  }

  /* ---------- since last open (device-local fingerprint, no invented data) ---------- */
  function snapFP() {
    return {
      charWins: D.kids.char.wins.length,
      vicWins: D.kids.vic.wins.length,
      charCI: D.kids.char.checkin_count,
      vicCI: D.kids.vic.checkin_count,
      sheets: D.hspt.sheets.length,
      gen: D.generated_at
    };
  }
  function showDelta() {
    var el = $("#delta");
    if (!el || !D || SNAP) { if (el) el.hidden = true; return; }
    var prev = store("lastFP"), cur = snapFP();
    store("lastFP", cur);
    store("lastOpen", new Date().toISOString());
    if (!prev) {
      el.innerHTML = '<span class="tag">Welcome back</span><span>Fridge board ready · Char ' + cur.charCI + " check-ins · Vic " + cur.vicCI + " · " + cur.sheets + " HSPT sheets</span>";
      el.hidden = false;
      return;
    }
    var bits = [];
    if (cur.charWins > prev.charWins) bits.push("+" + (cur.charWins - prev.charWins) + " Char win" + (cur.charWins - prev.charWins === 1 ? "" : "s"));
    if (cur.vicWins > prev.vicWins) bits.push("+" + (cur.vicWins - prev.vicWins) + " Vic win" + (cur.vicWins - prev.vicWins === 1 ? "" : "s"));
    if (cur.charCI > prev.charCI) bits.push("+" + (cur.charCI - prev.charCI) + " Char check-in" + (cur.charCI - prev.charCI === 1 ? "" : "s"));
    if (cur.vicCI > prev.vicCI) bits.push("+" + (cur.vicCI - prev.vicCI) + " Vic check-in" + (cur.vicCI - prev.vicCI === 1 ? "" : "s"));
    if (cur.sheets > prev.sheets) bits.push("+" + (cur.sheets - prev.sheets) + " HSPT sheet" + (cur.sheets - prev.sheets === 1 ? "" : "s"));
    if (!bits.length) {
      el.innerHTML = '<span class="tag">Since last open</span><span>No new check-ins or wins since then · last board data ' + esc(fmt(D.kids.char.data_range.last)) + "</span>";
    } else {
      el.innerHTML = '<span class="tag">Since last open</span><span>' + bits.map(esc).join(" · ") + "</span>";
    }
    el.hidden = false;
  }

  /* ---------- local-only fun: high fives + new-win cheers (stored on this device only) ---------- */
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem("fb:" + key)); localStorage.setItem("fb:" + key, JSON.stringify(val)); } catch (e) { return null; } }
  function hi5Count(kid) { var n = store("hi5:" + kid) || 0; return n ? ' · <span class="hi5n">🙌 ' + n + "</span>" : ""; }
  var CHEERS = ["You've got this!", "Proud of you!", "One step at a time!", "Keep shining!", "Awesome effort!", "Way to go!"];
  function cheerNewWins() {
    var seen = store("seenWins") || null, all = [], fresh = [];
    ["char", "vic"].forEach(function (kid) { D.kids[kid].wins.forEach(function (w) { var key = kid + "|" + w.name + "|" + w.date; all.push(key); if (seen && seen.indexOf(key) < 0) fresh.push(D.kids[kid].nick + ": " + w.name); }); });
    store("seenWins", all);
    if (fresh.length) { setTimeout(function () { confetti(innerWidth / 2, innerHeight / 3); toast("🎉 New win! " + fresh[0] + (fresh.length > 1 ? " (+" + (fresh.length - 1) + " more)" : "")); }, 600); }
  }

  /* ---------- views ---------- */
  function home() {
    var h = D.hspt, n = h.test_day ? daysBetween(today(), parse(h.test_day)) : null;
    function col(kid) {
      var k = D.kids[kid];
      var count = kid === "char" && n != null && n >= 0 ?
        '<a href="#hspt" class="card count-card pin tilt-l" style="--pinc:#ffd54a"><div><div class="big">' + n + '</div><div class="lbl">days</div></div><div><div style="font-size:18px;font-weight:900">to the HSPT 🧭</div><div class="s">' + h.sheets.length + " practice sheets ready from Path</div></div></a>" : "";
      var bottom = count ? '<div class="row2">' + count + '<div class="card"><h3>📅 Coming up</h3>' + upcomingList(kid, 2) + "</div></div>"
                         : '<div class="card"><h3>📅 Coming up</h3>' + upcomingList(kid) + "</div>";
      return '<section class="kidcol">' + kidHead(kid) +
        '<div class="card"><h3>🗓️ Check-ins <span class="pill ' + kid + '">' + fmt(k.data_range.first) + " – " + fmt(k.data_range.last) + "</span></h3>" + strip(kid) + freshLine(kid) + "</div>" +
        '<div class="row2"><div class="card sticky pin tilt-l" style="--pinc:var(--' + kid + ')"><h3>🌟 Wins</h3>' + winList(k.wins, 3) + "</div>" +
        '<div class="card sticky mint pin tilt-r" style="--pinc:#2fb67c"><h3>🌱 Next tiny steps</h3>' + focusList(k.focus, 2, kid) + "</div></div>" +
        bottom + "</section>";
    }
    return '<div class="home">' + col("char") + col("vic") + "</div>";
  }

  function monthGrid(y, m, kid, marks) {
    var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), t = iso(today()), h = '<div class="month"><h4>' + MONTHS[m] + " " + y + '</h4><div class="mgrid">';
    DOW.forEach(function (d) { h += '<div class="dow">' + d[0] + "</div>"; });
    for (var i = 0; i < first.getDay(); i++) h += '<div class="c blank"></div>';
    for (var d = 1; d <= days; d++) {
      var key = iso(new Date(y, m, d)), c = D.kids[kid].calendar[key], cls = "c", mk = "";
      if (c && (c.run || c.report)) cls += " run";
      if (c && (c.report === "report" || c.report === "onenote")) mk = "★";
      if (c && c.report === "portal-down") mk = "☁";
      if (marks && marks[key]) cls += " hs";
      if (key === t) cls += " today";
      if (D.hspt.test_day === key && kid === "char") mk = "🏁";
      h += '<div class="' + cls + '">' + d + (mk ? '<span class="m">' + mk + "</span>" : "") + "</div>";
    }
    return h + "</div></div>";
  }

  function kidPage(kid) {
    var k = D.kids[kid], marks = null;
    if (kid === "char") { marks = {}; D.hspt.sheets.forEach(function (s) { if (s.date) marks[s.date] = 1; }); }
    var t = today(), months = [[2026, 8], [2026, 9]];
    if (t.getFullYear() === 2026 && t.getMonth() > 9) months = [[2026, 9], [2026, t.getMonth()]];
    var cal = '<div class="cal" style="--kc:var(--' + kid + ')">' + months.map(function (ym) { return monthGrid(ym[0], ym[1], kid, marks); }).join("") + "</div>" +
      '<div class="legend"><span><i class="sw" style="background:var(--' + kid + ')"></i>tutor check-in</span><span>★ grade report saved</span><span>☁ school site down</span>' +
      (kid === "char" ? '<span><i class="sw" style="box-shadow:inset 0 -4px 0 var(--hspt);background:#f6f3ec"></i>HSPT practice sheet</span>' : "") + "<span>┅ today</span></div>";
    var classes = k.classes ? '<div class="report">' + k.classes.classes.map(function (c) {
      if (c.focus) return '<div class="subj focus"><div class="sn">' + ic(c.subject) + " " + esc(c.subject) + '</div><div class="sg">🌱 Focus area</div></div>';
      if (c.credit) return '<div class="subj credit"><div class="sn">' + ic(c.subject) + " " + esc(c.subject) + '</div><div class="sg">✓ On track</div></div>';
      return '<div class="subj"><div class="sn">' + ic(c.subject) + " " + esc(c.subject) + '</div><div class="sg">' + esc(c.letter) + "</div></div>";
    }).join("") + "</div>" : empty("📒", "No class snapshot saved yet.");
    var max = Math.max.apply(null, k.subjects.map(function (s) { return s.count; }).concat([1]));
    var bars = '<div class="bars" style="--kc:var(--' + kid + ')">' + k.subjects.map(function (s) {
      return '<div class="bar"><span>' + ic(s.subject) + " " + esc(s.subject) + '</span><span class="tr"><i style="width:' + (s.count ? Math.max(6, 100 * s.count / max) : 0) + '%"></i></span><span>' + s.count + "</span></div>";
    }).join("") + "</div>";
    var pending = k.pending.length ? '<ul class="list">' + k.pending.map(function (p) {
      return '<li><span class="ic">⏳</span><span class="tx"><b>' + esc(p.subject) + ":</b> " + esc(p.name) + '<span class="meta">due ' + fmt(p.due) + " · " + esc(p.note || "") + "</span></span></li>";
    }).join("") + "</ul>" : empty("✅", "Nothing waiting on a grade.");
    var lastList = k.last_known_list.length ? '<div class="card"><h3>📋 Last homework list <span class="pill">saved ' + fmt(k.last_known_list[0].date) + ", now past</span></h3>" +
      '<ul class="list past">' + k.last_known_list.map(function (p) {
        return '<li><span class="ic">' + (p.kind === "test" ? "📝" : ic(p.subject)) + '</span><span class="tx"><b>' + esc(p.subject) + ":</b> " + esc(p.name) +
          '<span class="meta">' + (p.due ? (p.kind === "test" ? "quiz " : "due ") + fmtDow(p.due) : "no due date listed") + "</span></span></li>";
      }).join("") + "</ul></div>" : "";
    return '<div class="kidpage">' + '<div class="wide">' + kidHead(kid) + "</div>" +
      '<div class="stack"><div class="card"><h3>🗓️ Check-in calendar <span class="pill ' + kid + '">best streak ' + k.best_streak + " nights</span></h3>" + cal + "</div>" +
      '<div class="card"><h3>📒 Class snapshot <span class="pill">as of ' + fmt(k.classes && k.classes.as_of) + "</span></h3>" + classes + "</div>" +
      '<div class="card"><h3>📚 Subjects in the tutor notes <span class="pill">items saved</span></h3>' + bars + "</div></div>" +
      '<div class="stack"><div class="card"><h3>🎖️ Badges</h3>' + badgeRow(kid) + "</div>" +
      '<div class="card sticky pin tilt-l" style="--pinc:var(--' + kid + ')"><h3>🌟 Wins</h3>' + winList(k.wins) + "</div>" +
      '<div class="card sticky mint pin tilt-r" style="--pinc:#2fb67c"><h3>🌱 Next tiny steps</h3>' + focusList(k.focus, 99, kid) + "</div>" +
      '<div class="card"><h3>⏳ Waiting for a grade</h3>' + pending + "</div>" +
      '<div class="card"><h3>📅 Coming up</h3>' + upcomingList(kid) + "</div>" + lastList + "</div></div>";
  }

  function hsptPage() {
    var h = D.hspt, t = today(), n = h.test_day ? daysBetween(t, parse(h.test_day)) : null;
    var first = h.sheets.length ? parse(h.sheets[0].date) : t, total = h.test_day ? Math.max(1, daysBetween(first, parse(h.test_day))) : 1;
    var frac = n != null ? Math.min(1, Math.max(0, 1 - n / total)) : 0, C = 2 * Math.PI * 100;
    var ring = '<div class="ring"><svg width="230" height="230"><circle cx="115" cy="115" r="100" fill="none" stroke="#e2f1ee" stroke-width="18"/>' +
      '<circle cx="115" cy="115" r="100" fill="none" stroke="#1f9e8f" stroke-width="18" stroke-linecap="round" stroke-dasharray="' + (C * frac) + " " + C + '"/></svg>' +
      '<div class="in"><div class="n">' + (n != null && n >= 0 ? n : "—") + '</div><div class="l">days to go</div><div class="small muted" style="margin-top:4px">' + (h.test_day ? fmtDow(h.test_day) + " · at SJE" : "") + "</div></div></div>";
    var stones = h.sheets.map(function (s) {
      return '<div class="stone done" title="Day ' + s.day + " · " + fmt(s.date) + (s.date_inferred ? " (date inferred)" : "") + " · " + s.questions + ' questions">' + s.day + "</div>";
    }).join("");
    var left = n != null ? Math.max(0, n) : 0, todo = "";
    for (var i = 1; i <= Math.min(left, 45); i++) todo += '<div class="stone todo">' + (h.sheets.length + i) + "</div>";
    var flag = '<div class="stone flag" title="Test day">🏁</div>';
    var trailPct = h.sheets.length + left > 0 ? Math.round(100 * h.sheets.length / (h.sheets.length + Math.min(left, 45))) : 0;
    var areas = h.area_questions, max = Math.max.apply(null, Object.values(areas).concat([1]));
    var bars = '<div class="bars" style="--kc:var(--hspt)">' + Object.keys(areas).map(function (a) {
      return '<div class="bar"><span>' + esc(a) + '</span><span class="tr"><i style="width:' + (100 * areas[a] / max) + '%"></i></span><span>' + areas[a] + "</span></div>";
    }).join("") + "</div>";
    function dclass(d) { d = (d || "").toLowerCase(); return d.indexOf("easy–medium") >= 0 || d.indexOf("easy-medium") >= 0 ? "d-em" : d.indexOf("easy") >= 0 ? "d-easy" : "d-med"; }
    var recent = h.sheets.slice(-4).reverse().map(function (s) {
      return '<div style="margin-bottom:10px"><b>Day ' + s.day + "</b> <span class='muted small'>" + fmtDow(s.date) + " · " + s.questions + ' questions</span><div class="diffrow" style="margin-top:4px">' +
        s.sections.map(function (x) { return '<span class="' + dclass(x.difficulty) + '">' + esc(x.label) + "</span>"; }).join("") + "</div></div>";
    }).join("");
    var openHouse = D.kids.char.upcoming.filter(function (u) { return u.kind === "event"; });
    return '<div class="hspt"><div class="stack"><div class="card pin" style="--pinc:var(--hspt)"><h3>🧭 HSPT countdown</h3>' + ring +
      '<div class="small muted" style="text-align:center">Path makes a 10–15 minute practice sheet every morning.</div></div>' +
      '<div class="card"><h3>📝 Practice scores</h3>' + (h.scores.length ? "" : empty("✏️", "No scores saved yet. When a sheet gets graded with Path, the score will show up here.")) + "</div>" +
      '<div class="card"><h3>📅 Key dates</h3><ul class="list">' + openHouse.map(function (u) {
        return '<li><span class="ic">🏫</span><span class="tx"><b>' + esc(u.name) + '</b><span class="meta">' + fmtDow(u.due) + "</span></span></li>";
      }).join("") + (h.test_day ? '<li><span class="ic">🏁</span><span class="tx"><b>HSPT test day at SJE</b><span class="meta">' + fmtDow(h.test_day) + "</span></span></li>" : "") + "</ul></div></div>" +
      '<div class="stack"><div class="card"><h3>👣 The trail to test day <span class="pill hspt">' + h.sheets.length + " sheets ready · " + h.daily_streak + "-day run</span></h3>" +
      '<div class="trail" style="--trail-pct:' + trailPct + '%">' + stones + todo + flag + '</div><div class="small muted" style="margin-top:8px">Teal stones = practice sheets Path has made (' + fmt(h.streak_range && h.streak_range[0]) + " – " + fmt(h.streak_range && h.streak_range[1]) + "). Dashed stones = days left before the test. The path fills as sheets appear.</div></div>" +
      '<div class="row2"><div class="card"><h3>🧩 Questions by HSPT area <span class="pill">' + h.total_questions + " total</span></h3>" + bars + "</div>" +
      '<div class="card"><h3>🆕 Latest sheets</h3>' + recent + "</div></div></div></div>";
  }

  function grownups() {
    var rows = function (kid) {
      var k = D.kids[kid];
      return Object.keys(k.calendar).sort().map(function (d) {
        var c = k.calendar[d], run = k.checkins.filter(function (r) { return r.date === d; })[0];
        var out = c.report === "report" ? "⭐ Grade report" : c.report === "onenote" ? "Homework list" : c.report === "portal-down" ? "☁ School portal was down" : "No report saved";
        return "<tr><td>" + fmtDow(d) + "</td><td>" + (run ? esc(run.time) : "—") + "</td><td>" + out + "</td></tr>";
      }).join("");
    };
    var cls = function (kid) {
      var k = D.kids[kid];
      if (!k.classes) return "";
      return k.classes.classes.map(function (c) {
        return esc(c.subject) + ": " + (c.focus ? "focus area" : c.credit ? "credit/on track" : esc(c.letter) + " (" + c.pct + "%)");
      }).join(" · ");
    };
    var att = function (kid) { var a = D.kids[kid].attendance; return a ? a.absences + " absence" + (a.absences === 1 ? "" : "s") + " as of " + fmt(a.as_of) : "not logged"; };
    return '<div class="gu"><div class="stack"><div class="card"><h3>☕ For grown-ups</h3><p class="small" style="margin-top:0">This board is built only from what the tutor bots already saved on this computer. It runs locally and never sends anything anywhere. Low grades show up as <b>focus areas</b> with a next step, never as a score.</p>' +
      '<p class="small"><b>Char classes:</b> ' + cls("char") + "<br><b>Attendance:</b> " + att("char") + '</p><p class="small"><b>Vic classes:</b> ' + cls("vic") + "<br><b>Attendance:</b> " + att("vic") + "</p></div>" +
      '<div class="card"><h3>🕳️ Gaps (what\'s missing)</h3><ul class="small gaps">' + D.gaps.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul>" +
      (D.warnings.length ? '<h3 style="margin-top:12px">⚠️ Collector warnings</h3><ul class="small">' + D.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") + "</div>" +
      '<div class="card"><h3>📂 Sources (read-only)</h3><table>' + D.sources.map(function (s) { return "<tr><td>" + esc(s.label) + "</td><td><code>" + esc(s.path) + "</code></td></tr>"; }).join("") + "</table>" +
      '<p class="small muted">Data collected ' + esc(D.generated_at.replace("T", " ").slice(0, 16)) + " ET." + (SNAP ? " This is an offline snapshot." : ' <button class="linkbtn" id="refresh">Refresh now</button>') + "</p></div></div>" +
      '<div class="stack"><div class="card"><h3>Char: check-in log</h3><table><tr><th>Day</th><th>Routine ran</th><th>Saved that day</th></tr>' + rows("char") + "</table></div>" +
      '<div class="card"><h3>Vic: check-in log</h3><table><tr><th>Day</th><th>Routine ran</th><th>Saved that day</th></tr>' + rows("vic") + "</table></div></div></div>";
  }

  /* ---------- confetti + toast (polished: mixed shapes) ---------- */
  var cv = $("#confetti"), cx = cv.getContext("2d"), parts = [], raf = null;
  function confetti(x, y) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cv.width = innerWidth; cv.height = innerHeight;
    var cols = ["#e85d75","#f5b700","#2fb67c","#4aa3e8","#7c5cd6","#f08a24","#1f9e8f","#fff"];
    for (var i = 0; i < 110; i++) {
      parts.push({
        x: x, y: y,
        vx: (Math.random() - .5) * 14,
        vy: -Math.random() * 14 - 4,
        r: Math.random() * 7 + 2,
        c: cols[i % cols.length],
        a: Math.random() * 6,
        life: 0,
        shape: i % 3
      });
    }
    if (!raf) tick();
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.life < 120; });
    parts.forEach(function (p) {
      p.life++; p.vy += .32; p.x += p.vx; p.y += p.vy; p.a += .18;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.globalAlpha = 1 - p.life / 120;
      if (p.shape === 0) cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else if (p.shape === 1) { cx.beginPath(); cx.arc(0, 0, p.r * .7, 0, Math.PI * 2); cx.fill(); }
      else { cx.beginPath(); cx.moveTo(0, -p.r); cx.lineTo(p.r, p.r); cx.lineTo(-p.r, p.r); cx.closePath(); cx.fill(); }
      cx.restore();
    });
    raf = parts.length ? requestAnimationFrame(tick) : null;
    if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }
  var tt = null;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 3200); }

  /* ---------- routing ---------- */
  var ROUTES = {home: home, char: function () { return kidPage("char"); }, vic: function () { return kidPage("vic"); }, hspt: hsptPage, grownups: grownups};
  function route() {
    var tab = (location.hash || "#home").slice(1);
    if (!ROUTES[tab]) tab = "home";
    document.querySelectorAll("#tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === tab); });
    if (!D) return;
    $("#view").innerHTML = ROUTES[tab]();
    $("#view").scrollTop = 0;
    weekGlance();
    var r = $("#refresh"); if (r) r.onclick = function () { load(true); };
    if (kiosk) restartSlideBar();
  }
  document.addEventListener("click", function (e) {
    var h5 = e.target.closest && e.target.closest(".hi5");
    if (h5) {
      var kid = h5.dataset.kid, n = (store("hi5:" + kid) || 0) + 1, rr = h5.getBoundingClientRect();
      store("hi5:" + kid, n); confetti(rr.left + rr.width / 2, rr.top + rr.height / 2);
      toast("🙌 High five, " + D.kids[kid].nick + "! " + CHEERS[n % CHEERS.length]);
      var hn = h5.parentNode.querySelector(".hi5n"); if (hn) hn.textContent = "🙌 " + n; else route();
      return;
    }
    var b = e.target.closest && e.target.closest(".badge");
    if (b) { var rc = b.getBoundingClientRect(); confetti(rc.left + rc.width / 2, rc.top + rc.height / 2); toast(b.dataset.title + ": " + b.dataset.why); }
  });

  var kiosk = /kiosk/.test(location.search), kt = null;
  function restartSlideBar() {
    var bar = $("#slideprog");
    if (!bar) return;
    bar.hidden = !kiosk;
    document.body.classList.toggle("kiosk-on", kiosk);
    if (!kiosk) return;
    var i = bar.querySelector("i");
    if (i) { i.style.animation = "none"; void i.offsetWidth; i.style.animation = ""; }
  }
  function setKiosk(on) {
    kiosk = on; clearInterval(kt);
    if (on) kt = setInterval(function () { var order = ["home", "char", "vic", "hspt"], cur = (location.hash || "#home").slice(1); location.hash = order[(order.indexOf(cur) + 1) % order.length]; }, 40000);
    restartSlideBar();
    foot();
  }
  function foot() {
    if (!D) return;
    $("#foot").innerHTML = "<span>🔒 Family-only · runs on this computer · nothing is sent anywhere</span><span>" +
      (SNAP ? "Offline snapshot from " + esc(D.generated_at.slice(0, 10)) : "Updated " + esc(D.generated_at.slice(11, 16)) + " ET") +
      ' · <button id="kbtn">' + (kiosk ? "Stop slideshow" : "Slideshow") + "</button></span>";
    $("#kbtn").onclick = function () { setKiosk(!kiosk); };
  }

  function load(force) {
    if (SNAP) { D = window.__BOARD__; foot(); showDelta(); route(); cheerNewWins(); return; }
    fetch(force ? "/api/refresh" : "/api/board", {cache: "no-store"}).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error);
      var firstLoad = !D; D = j; foot(); if (firstLoad) showDelta(); route(); if (firstLoad) cheerNewWins(); if (force) toast("Fridge refreshed ✨");
    }).catch(function (e) { $("#view").innerHTML = '<div class="loading">The board couldn\'t load (' + esc(e.message) + ").</div>"; });
  }

  magnets(); clock(); setInterval(clock, 15000);
  window.addEventListener("hashchange", route);
  route(); load(false); setKiosk(kiosk);
  if (!SNAP) setInterval(function () { load(false); }, 10 * 60 * 1000);
})();
