#!/usr/bin/env node
/**
 * End-to-end smoke test against a running deployment (T-24/T-27 at API level).
 * analyse -> draft core -> draft structure -> chapters 1..3 over SSE with retries.
 *
 * Usage: BASE_URL=https://host DEMO_ACCESS_CODE=... node scripts/e2e-smoke.mjs [en|zh]
 */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const lang = process.argv[2] ?? "en";
const headers = { "content-type": "application/json", ...(process.env.DEMO_ACCESS_CODE ? { "x-demo-access": process.env.DEMO_ACCESS_CODE } : {}) };

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
async function post(path, body) {
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return undefined; } })() };
}
function parseSse(text) {
  return text.split(/\n\n/).flatMap((block) => {
    const ev = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    return ev && data ? [{ event: ev, data: JSON.parse(data) }] : [];
  });
}

const t0 = Date.now();
const sample = lang === "zh"
  ? Array.from({ length: 25 }, (_, i) => "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥".slice(i % 5, (i % 5) + 18) + "。").join("")
  : Array.from({ length: 22 }, (_, i) => Array.from({ length: 10 }, (_, k) => `w${(i * 10 + k) % 97}x`).join(" ") + ".").join(" ");

const a = await post("/api/style/analyse", { sampleText: sample });
if (a.status !== 200) fail(`analyse ${a.status} ${a.text}`);
const profile = a.json.profile;
console.log(`analyse ok: language=${profile.language}`);

const seed = { genre: "Test genre", tone: "Test tone", idea: lang === "zh" ? "一个测试想法。" : "A test idea." };
const core = await post("/api/bible/draft", { layer: "core", seed, styleProfile: profile });
if (core.status !== 200) fail(`draft core ${core.status} ${core.text}`);
const structure = await post("/api/bible/draft", { layer: "structure", seed, styleProfile: profile, core: core.json.draft });
if (structure.status !== 200) fail(`draft structure ${structure.status} ${structure.text}`);
const bible = { genre: seed.genre, tone: seed.tone, ...core.json.draft, ...structure.json.draft };
console.log("bible drafted: core + structure");

const accepted = [];
const foreshadowing = Object.fromEntries(bible.foreshadowing.map((f) => [f.id, f.status]));
let vetoes = 0;
for (const n of [1, 2, 3]) {
  let retry = 0;
  let veto;
  for (;;) {
    const r = await post("/api/pipeline/stream", {
      runId: `smoke-${n}-${retry}-${Date.now()}`, chapterNumber: n, retryCount: retry, restartAt: "outline",
      styleProfile: profile, bible, acceptedChapters: accepted,
      continuityLedger: { characterStatuses: {}, foreshadowing },
      ...(veto ? { vetoNotes: veto } : {}),
    });
    if (r.status !== 200) fail(`chapter ${n} ${r.status} ${r.text}`);
    const events = parseSse(r.text);
    const done = events.at(-1);
    if (done?.event !== "done") fail(`chapter ${n}: stream did not end with done`);
    const acc = events.find((e) => e.event === "chapter-accepted");
    if (acc) {
      accepted.push(acc.data.chapter);
      for (const t of acc.data.chapter.relayReceipt.foreshadowingTransitions) foreshadowing[t.id] = t.to;
      console.log(`chapter ${n} accepted: ${acc.data.wordCount} units, retries=${retry}`);
      break;
    }
    const c = events.find((e) => e.event === "continuity");
    if (c?.data.status !== "VETO" || retry >= 3) fail(`chapter ${n} not accepted: ${JSON.stringify(events.find((e) => e.event === "error")?.data ?? done.data)}`);
    vetoes += 1;
    veto = c.data.failures;
    retry += 1;
  }
}
const fourth = await post("/api/pipeline/stream", { runId: "smoke-4", chapterNumber: 4, retryCount: 0, restartAt: "outline", styleProfile: profile, bible, acceptedChapters: accepted, continuityLedger: { characterStatuses: {}, foreshadowing } });
if (fourth.status !== 400) fail(`chapter 4 should be refused, got ${fourth.status}`);
const allPaid = Object.values(foreshadowing).every((s) => s === "paidOff");
console.log(`PASS: 3 chapters accepted, ${vetoes} veto(es) retried, 4th chapter refused, all foreshadowing paid off=${allPaid}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
