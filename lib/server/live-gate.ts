/**
 * Live gate: demo access code and rate limits (requirements REQ-32, design §2.13, T-31).
 * Runs before any model call. Counters hold no story data and no raw IP address.
 */
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type GateKind = "pass" | "draft";

export const LIMITS = Object.freeze({
  lockSeconds: 130,
  windowSeconds: 600,
  passesPerWindow: 8,
  draftsPerWindow: 6,
  passesPerDay: 60,
  draftsPerDay: 60,
  dayKeySeconds: 36 * 3600,
  badCodesPerWindow: 10,
  banSeconds: 600,
});

/** Minimal counter store; Upstash REST in Production, memory in development and tests. */
export interface CounterStore {
  exists(key: string): Promise<boolean>;
  /** SET key 1 EX seconds [NX]; returns false when NX and the key exists. */
  set(key: string, seconds: number, nx: boolean): Promise<boolean>;
  /** INCR key, setting the expiry only when the key is new. */
  incr(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<void>;
}

export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const m = new Map<string, { v: number; exp: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp <= now()) m.delete(k);
    return m.get(k);
  };
  return {
    async exists(k) { return live(k) !== undefined; },
    async set(k, s, nx) {
      if (nx && live(k)) return false;
      m.set(k, { v: 1, exp: now() + s * 1000 });
      return true;
    },
    async incr(k, s) {
      const e = live(k);
      if (e) { e.v += 1; return e.v; }
      m.set(k, { v: 1, exp: now() + s * 1000 });
      return 1;
    },
    async del(k) { m.delete(k); },
  };
}

/** Upstash Redis over its REST API with plain fetch (design §2.13). */
export function createUpstashStore(url: string, secret: string, fetchImpl: typeof fetch = fetch): CounterStore {
  const base = url.replace(/\/+$/, "");
  async function send(path: string, body: unknown): Promise<unknown> {
    const res = await fetchImpl(base + path, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`counter store ${res.status}`);
    return res.json();
  }
  const one = async (cmd: unknown[]) => ((await send("", cmd)) as { result: unknown }).result;
  return {
    async exists(k) { return Number(await one(["EXISTS", k])) > 0; },
    async set(k, s, nx) { return (await one(nx ? ["SET", k, "1", "EX", s, "NX"] : ["SET", k, "1", "EX", s])) === "OK"; },
    async incr(k, s) {
      const r = (await send("/pipeline", [["INCR", k], ["EXPIRE", k, s, "NX"]])) as Array<{ result: unknown }>;
      return Number(r[0]?.result);
    },
    async del(k) { await one(["DEL", k]); },
  };
}

export type GateRefusal = { status: 401 | 429 | 503; code: "access-required" | "rate-limited" | "live-unavailable"; message: string; retryAfterSeconds?: number };
export type GateResult = { ok: true; release: () => Promise<void> } | { ok: false; refusal: GateRefusal };

export type GateConfig = {
  liveOn: boolean;
  accessCode: string | null;
  hashSecret: string;
  store: CounterStore | null;
  now?: () => number;
};

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function codeMatches(given: string, expected: string): boolean {
  return timingSafeEqual(sha(given), sha(expected));
}

/** First X-Forwarded-For value, which Vercel sets; "local" otherwise. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function createLiveGate(cfg: GateConfig) {
  const now = cfg.now ?? Date.now;
  const refuse = (r: GateRefusal): GateResult => ({ ok: false, refusal: r });
  const unavailable = refuse({ status: 503, code: "live-unavailable", message: "Live mode is off. Watch a recorded run instead." });

  async function check(request: Request, kind: GateKind): Promise<GateResult> {
    if (!cfg.liveOn || !cfg.store) return unavailable;
    const store = cfg.store;
    const ip = createHmac("sha256", cfg.hashSecret).update(clientIp(request)).digest("hex").slice(0, 32);
    const bucket = Math.floor(now() / 1000 / LIMITS.windowSeconds);
    const day = new Date(now()).toISOString().slice(0, 10);
    try {
      if (await store.exists(`ss:ban:${ip}`)) {
        return refuse({ status: 429, code: "rate-limited", message: "Too many wrong codes. Wait and try again.", retryAfterSeconds: LIMITS.banSeconds });
      }
      if (cfg.accessCode !== null) {
        const given = request.headers.get("x-demo-access") ?? "";
        if (!given || !codeMatches(given, cfg.accessCode)) {
          const bad = await store.incr(`ss:bad:${ip}:${bucket}`, LIMITS.windowSeconds);
          if (bad >= LIMITS.badCodesPerWindow) await store.set(`ss:ban:${ip}`, LIMITS.banSeconds, false);
          return refuse({ status: 401, code: "access-required", message: "Live mode needs a valid demo access code." });
        }
      }
      const lockKey = `ss:lock:${ip}`;
      if (!(await store.set(lockKey, LIMITS.lockSeconds, true))) {
        return refuse({ status: 429, code: "rate-limited", message: "One live request at a time.", retryAfterSeconds: 10 });
      }
      const release = async () => { await store.del(lockKey).catch(() => undefined); };
      const perWindow = kind === "pass" ? LIMITS.passesPerWindow : LIMITS.draftsPerWindow;
      const perDay = kind === "pass" ? LIMITS.passesPerDay : LIMITS.draftsPerDay;
      if ((await store.incr(`ss:win:${kind}:${ip}:${bucket}`, LIMITS.windowSeconds)) > perWindow) {
        await release();
        const left = LIMITS.windowSeconds - (Math.floor(now() / 1000) % LIMITS.windowSeconds);
        return refuse({ status: 429, code: "rate-limited", message: "Too many live requests. Wait and try again.", retryAfterSeconds: left });
      }
      if ((await store.incr(`ss:day:${kind}:${day}`, LIMITS.dayKeySeconds)) > perDay) {
        await release();
        const secs = 86400 - (Math.floor(now() / 1000) % 86400);
        return refuse({ status: 429, code: "rate-limited", message: "Today's live budget is used up. Watch a recorded run.", retryAfterSeconds: secs });
      }
      return { ok: true, release };
    } catch {
      return unavailable; // fail closed when the store is unreachable
    }
  }
  return { check };
}

export type LiveGate = ReturnType<typeof createLiveGate>;

/** Builds the gate from the server environment (design §2.13). */
export function liveGateFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): LiveGate {
  const prod = env.NODE_ENV === "production";
  const code = env.DEMO_ACCESS_CODE?.trim() || null;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const secret = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const hashSecret = env.RATE_LIMIT_SECRET?.trim() || (prod ? "" : "dev-only-rate-limit-secret");
  const allowMemory = !prod || env.LIVE_GATE_MEMORY_STORE === "1";
  const store = url && secret ? createUpstashStore(url, secret) : allowMemory ? createMemoryStore() : null;
  const liveOn = (code !== null || !prod) && hashSecret !== "";
  return createLiveGate({ liveOn, accessCode: code, hashSecret, store });
}

let shared: LiveGate | null = null;
export function sharedLiveGate(): LiveGate {
  shared ??= liveGateFromEnv();
  return shared;
}

export function refusalResponse(r: GateRefusal): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (r.retryAfterSeconds !== undefined) headers["Retry-After"] = String(r.retryAfterSeconds);
  return Response.json({ code: r.code, message: r.message, ...(r.retryAfterSeconds !== undefined ? { retryAfterSeconds: r.retryAfterSeconds } : {}) }, { status: r.status, headers });
}
