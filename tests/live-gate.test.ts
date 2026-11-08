import { describe, expect, it, vi } from "vitest";
import { clientIp, createLiveGate, createMemoryStore, createUpstashStore, LIMITS, liveGateFromEnv, refusalResponse, type CounterStore } from "@/lib/server/live-gate";

const T0 = Date.UTC(2026, 10, 8, 3, 0, 0);
const req = (code?: string, ip = "203.0.113.7") =>
  new Request("http://x", { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, ...(code ? { "x-demo-access": code } : {}) } });

function gate(o: { code?: string | null; store?: CounterStore | null; liveOn?: boolean; now?: () => number } = {}) {
  let t = T0;
  const now = o.now ?? (() => t);
  const store = o.store === undefined ? createMemoryStore(now) : o.store;
  const g = createLiveGate({ liveOn: o.liveOn ?? true, accessCode: o.code === undefined ? "open-sesame" : o.code, hashSecret: "s", store, now });
  return { g, store, advance: (ms: number) => (t += ms) };
}

describe("live gate (T-31, T-32)", () => {
  it("is off when live mode is off or there is no store", async () => {
    expect(await gate({ liveOn: false }).g.check(req("open-sesame"), "pass")).toMatchObject({ ok: false, refusal: { status: 503, code: "live-unavailable" } });
    expect(await gate({ store: null }).g.check(req("open-sesame"), "pass")).toMatchObject({ ok: false, refusal: { status: 503 } });
  });
  it("needs the access code", async () => {
    const { g } = gate();
    expect(await g.check(req(), "pass")).toMatchObject({ ok: false, refusal: { status: 401, code: "access-required" } });
    expect(await g.check(req("wrong"), "pass")).toMatchObject({ ok: false, refusal: { status: 401 } });
    expect((await g.check(req("open-sesame"), "pass")).ok).toBe(true);
  });
  it("locks an IP out after 10 wrong codes, even with a valid code", async () => {
    const { g, advance } = gate();
    for (let i = 0; i < 10; i += 1) await g.check(req("wrong"), "pass");
    expect(await g.check(req("open-sesame"), "pass")).toMatchObject({ ok: false, refusal: { status: 429, code: "rate-limited" } });
    expect((await g.check(req("open-sesame", "198.51.100.1"), "pass")).ok).toBe(true);
    advance(LIMITS.banSeconds * 1000 + 1);
    expect((await g.check(req("open-sesame"), "pass")).ok).toBe(true);
  });
  it("allows one live request at a time per IP and frees the slot on release", async () => {
    const { g } = gate();
    const a = await g.check(req("open-sesame"), "pass");
    expect(await g.check(req("open-sesame"), "pass")).toMatchObject({ ok: false, refusal: { status: 429 } });
    if (a.ok) await a.release();
    expect((await g.check(req("open-sesame"), "pass")).ok).toBe(true);
  });
  it("refuses the 9th pass in 10 minutes", async () => {
    const { g, advance } = gate();
    for (let i = 0; i < 8; i += 1) {
      const r = await g.check(req("open-sesame"), "pass");
      expect(r.ok).toBe(true);
      if (r.ok) await r.release();
    }
    const ninth = await g.check(req("open-sesame"), "pass");
    expect(ninth).toMatchObject({ ok: false, refusal: { status: 429 } });
    if (!ninth.ok) expect(ninth.refusal.retryAfterSeconds).toBeGreaterThan(0);
    expect((await g.check(req("open-sesame"), "draft")).ok).toBe(true); // separate draft window
    advance(LIMITS.windowSeconds * 1000);
  });
  it("refuses the 61st pass in a day across IPs", async () => {
    const { g } = gate();
    for (let i = 0; i < 60; i += 1) {
      const r = await g.check(req("open-sesame", `192.0.2.${i}`), "pass");
      expect(r.ok).toBe(true);
      if (r.ok) await r.release();
    }
    expect(await g.check(req("open-sesame", "192.0.2.200"), "pass")).toMatchObject({ ok: false, refusal: { status: 429 } });
  });
  it("fails closed when the store throws", async () => {
    const broken: CounterStore = { exists: async () => { throw new Error("down"); }, set: async () => true, incr: async () => 1, del: async () => undefined };
    expect(await gate({ store: broken }).g.check(req("open-sesame"), "pass")).toMatchObject({ ok: false, refusal: { status: 503 } });
  });
  it("stores only hashed IPs", async () => {
    const keys: string[] = [];
    const mem = createMemoryStore(() => T0);
    const spy: CounterStore = { exists: (k) => { keys.push(k); return mem.exists(k); }, set: (k, s, n) => { keys.push(k); return mem.set(k, s, n); }, incr: (k, s) => { keys.push(k); return mem.incr(k, s); }, del: (k) => mem.del(k) };
    await gate({ store: spy }).g.check(req("open-sesame"), "pass");
    expect(keys.join(" ")).not.toContain("203.0.113.7");
  });
  it("reads the first X-Forwarded-For value", () => {
    expect(clientIp(req())).toBe("203.0.113.7");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
  it("builds a refusal response with Retry-After", async () => {
    const res = refusalResponse({ status: 429, code: "rate-limited", message: "m", retryAfterSeconds: 9 });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("9");
    expect(await res.json()).toEqual({ code: "rate-limited", message: "m", retryAfterSeconds: 9 });
  });
});

describe("liveGateFromEnv", () => {
  it("is live without a code in development", async () => {
    expect((await liveGateFromEnv({ NODE_ENV: "development" }).check(req(), "pass")).ok).toBe(true);
  });
  it("is off in production without a code or store", async () => {
    const g = liveGateFromEnv({ NODE_ENV: "production", RATE_LIMIT_SECRET: "x" });
    expect(await g.check(req(), "pass")).toMatchObject({ ok: false, refusal: { status: 503 } });
    const g2 = liveGateFromEnv({ NODE_ENV: "production", DEMO_ACCESS_CODE: "c", RATE_LIMIT_SECRET: "x" });
    expect(await g2.check(req("c"), "pass")).toMatchObject({ ok: false, refusal: { status: 503 } });
  });
  it("allows an explicit memory store in production for a single-server test deploy", async () => {
    const g = liveGateFromEnv({ NODE_ENV: "production", DEMO_ACCESS_CODE: "c", RATE_LIMIT_SECRET: "x", LIVE_GATE_MEMORY_STORE: "1" });
    expect((await g.check(req("c"), "pass")).ok).toBe(true);
  });
});

describe("Upstash store", () => {
  it("sends REST commands with the bearer secret", async () => {
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(Array.isArray(body[0]) ? [{ result: 3 }, { result: 1 }] : { result: body[0] === "SET" ? "OK" : 1 }));
    });
    const s = createUpstashStore("https://kv.example.test/", "sec", fetchImpl as unknown as typeof fetch);
    expect(await s.incr("k", 60)).toBe(3);
    expect(await s.set("k", 60, true)).toBe(true);
    expect(await s.exists("k")).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://kv.example.test/pipeline");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sec");
  });
});
