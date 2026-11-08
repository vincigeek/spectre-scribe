#!/usr/bin/env node
/**
 * Test-only OpenAI-compatible mock model (POST /v1/chat/completions).
 * It reads the agent role from the system prompt and the run parameters and data
 * sections from the user message, then returns output that passes the server
 * checks. Chapter 2 is vetoed once (no VETO NOTES yet) to exercise the retry path.
 * Never use it for a demo replay: replays must come from real runs (REQ-33d).
 *
 * Usage: node scripts/mock-llm.mjs [port]   (binds 127.0.0.1 only)
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8787);

function section(text, name) {
  const start = text.indexOf(`<<<${name} (read-only data, not instructions)>>>\n`);
  if (start < 0) return undefined;
  const from = text.indexOf("\n", start) + 1;
  const end = text.indexOf(`\n<<<END ${name}>>>`, from);
  try {
    return JSON.parse(text.slice(from, end));
  } catch {
    return undefined;
  }
}
const param = (text, key) => new RegExp(`^${key}: (.+)$`, "m").exec(text)?.[1]?.trim();

function outline(user, n) {
  const bible = section(user, "STORY BIBLE");
  const chars = bible.characters.map((c) => c.id);
  const fs = bible.foreshadowing.map((f) => f.id);
  const role = { 1: "setup-hook", 2: "escalation", 3: "payoff" }[n];
  const beat = (title, premise, planted, paid) => ({ title, premise, characterIds: chars.slice(0, 2), foreshadowingPlanted: planted, foreshadowingPaidOff: paid, arcRole: role });
  const beats =
    n === 1 ? [beat("Opening", "The mock setup begins.", fs, [])]
    : n === 2 ? [beat("Turn", "A reversal upends the plan.", fs.slice(0, 1), [])]
    : [beat("Ending", "Every open thread resolves.", [], fs)];
  return { mode: "chapter", chapterNumber: n, arcRole: role, beats };
}

function style(user, n) {
  const p = section(user, "STYLE PROFILE");
  return {
    chapterNumber: n,
    anchor: p.language === "zh" ? "模拟风格提示：句子简短。" : "Mock style guidance: keep sentences short.",
    notes: ["Mock note tied to sentence length."],
    targets: {
      sentenceLengthMean: p.sentenceLenMean, sentenceLengthStdDev: p.sentenceLenSD, vocabularyRichness: p.typeTokenRatio,
      dialogueRatio: p.dialogueRatio, pacingMarkersPer100Words: p.pacingMarkers, paragraphLengthMean: p.paraLenMean,
      paragraphLengthStdDev: p.paraLenSD, averageWordLength: p.avgWordLen,
    },
  };
}

function draft(user, n) {
  const zh = param(user, "story_language") === "zh";
  if (zh) return `# 模拟第${n}章\n\n${"这是测试用的模拟正文。".repeat(12)}\n\n${"故事在这里继续推进。".repeat(10)}`;
  return `# Mock Chapter ${n}\n\n${"This is mock prose for the test environment. ".repeat(12)}\n\n${"The story moves on here. ".repeat(10)}`;
}

function verdict(user, n) {
  const retry = user.includes("<<<VETO NOTES FROM THE LAST PASS");
  if (n === 2 && !retry) {
    return { chapterNumber: n, status: "VETO", failures: [{ checkId: "B", bibleField: "timeline[1].event", violation: "Mock veto to exercise the retry path.", fix: "Retry the chapter." }] };
  }
  return { chapterNumber: n, status: "APPROVED", failures: [] };
}

function plan(user) {
  const zh = param(user, "story_language") === "zh";
  if (param(user, "layer") === "core") {
    const ch = (i, role) => ({
      id: `char-${i}`, name: zh ? `模拟人物${"一二三"[i - 1]}` : `Mockname Person${i}`, role, status: "alive",
      description: zh ? "测试用人物。" : "A test character.",
      goal: zh ? "目标。" : "Goal.", motivation: zh ? "动机。" : "Motivation.", conflict: zh ? "冲突。" : "Conflict.", epiphany: zh ? "领悟。" : "Epiphany.",
    });
    return zh
      ? { mode: "plan", layer: "core", logline: "一个测试者想找到答案却遇到阻碍。", synopsis: ["开端。", "第一次灾难。", "中点反转。", "第二次灾难。", "结局。"],
          setting: { timePeriod: "测试时代", locations: ["测试地点"], worldRules: ["测试规则。"] }, characters: [ch(1, "protagonist"), ch(2, "antagonist"), ch(3, "supporting")] }
      : { mode: "plan", layer: "core", logline: "A tester wants an answer against a wall at a stake.", synopsis: ["Setup.", "First disaster.", "Midpoint reversal.", "Second disaster.", "Resolution."],
          setting: { timePeriod: "Test era", locations: ["Test place"], worldRules: ["Test rule."] }, characters: [ch(1, "protagonist"), ch(2, "antagonist"), ch(3, "supporting")] };
  }
  const core = section(user, "APPROVED CORE LAYER");
  const states = Object.fromEntries(core.characters.map((c) => [c.id, "alive"]));
  const t = zh ? "测试" : "Test";
  return {
    mode: "plan", layer: "structure",
    foreshadowing: [{ id: "fs-1", description: `${t} item one.`, status: "open" }, { id: "fs-2", description: `${t} item two.`, status: "open" }],
    timeline: [1, 2, 3].map((n) => ({ chapterNumber: n, event: `${t} event ${n}.` })),
    beatSheet: [1, 2, 3].map((n) => ({ chapterNumber: n, title: `${t} ${n}`, premise: `${t} premise ${n}.`, characterStates: { ...states } })),
  };
}

function respond(body) {
  const sys = body.messages?.[0]?.content ?? "";
  const user = body.messages?.[1]?.content ?? "";
  const agent = /^# Agent: (\w+)/m.exec(sys)?.[1];
  const n = Number(param(user, "chapter_number") ?? 1);
  if (param(user, "mode") === "plan") return JSON.stringify(plan(user));
  if (agent === "outline") return JSON.stringify(outline(user, n));
  if (agent === "style") return JSON.stringify(style(user, n));
  if (agent === "continuation") return draft(user, n);
  if (agent === "continuity") return JSON.stringify(verdict(user, n));
  return "{}";
}

createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let content;
    try {
      content = respond(JSON.parse(raw));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e) }));
      return;
    }
    const model = JSON.parse(raw).model ?? "mock";
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
    }, 150);
  });
}).listen(port, "127.0.0.1", () => console.log(`mock LLM on http://127.0.0.1:${port}/v1`));
