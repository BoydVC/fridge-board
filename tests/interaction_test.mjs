// Drives headless Chrome over CDP: clicks badges / high-five / tabs and checks for JS errors.
// Run: node --experimental-websocket tests/interaction_test.mjs  (server on :4343)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.FB_PORT || 4343;
const prof = mkdtempSync(join(tmpdir(), "fbcdp-"));
const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9333",
  `--user-data-dir=${prof}`, "--window-size=1280,800", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (name, cond, d = "") => { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + d)); cond ? ok++ : bad++; };
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch("http://127.0.0.1:9333/json")).json()).find((t) => t.type === "page"); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener("message", (m) => {
    const j = JSON.parse(m.data);
    if (j.id && pending.has(j.id)) { pending.get(j.id)(j.result); pending.delete(j.id); }
    if (j.method === "Runtime.exceptionThrown") errors.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    if (j.method === "Runtime.consoleAPICalled" && j.params.type === "error") errors.push(JSON.stringify(j.params.args));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#home` }); await sleep(2500);
  check("home rendered", await ev(`!!document.querySelector('.kidcol')`));
  await ev(`document.querySelector('.kidhead.char .badge').click()`); await sleep(400);
  const t1 = await ev(`document.getElementById('toast').textContent`);
  check("badge tap shows a celebration toast", /streak|perfect|A-Team|attendance|HSPT/.test(t1), t1);
  await ev(`document.querySelector('.hi5[data-kid=vic]').click()`); await sleep(400);
  const t2 = await ev(`document.getElementById('toast').textContent`);
  check("high-five toast", /High five, Vic/.test(t2), t2);
  check("high-five counter saved locally", (await ev(`localStorage.getItem('fb:hi5:vic')`)) === "1");
  for (const tab of ["char", "vic", "hspt", "grownups", "home"]) {
    await ev(`location.hash='#${tab}'`); await sleep(500);
    check(`tab ${tab} active`, await ev(`document.querySelector('#tabs a.on').dataset.tab`) === tab);
  }
  await ev(`document.getElementById('kbtn').click()`); await sleep(200);
  check("slideshow toggle", /Stop slideshow/.test(await ev(`document.getElementById('kbtn').textContent`)));
  check("no JS errors", errors.length === 0, errors.join(" | "));
  ws.close();
} catch (e) { check("cdp run", false, String(e)); }
finally { chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }); }
console.log(`\n${ok}/${ok + bad} interaction checks passed`);
process.exit(bad ? 1 : 0);
