/**
 * SSE framing and parsing shared by server and browser (design §2.6, T-16).
 * The browser cannot use EventSource for a POST, so it feeds fetch() chunks here.
 */

export type SseRecord = { id?: string; event: string; data: string };

export function formatSse(id: number, event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `id: ${id}\nevent: ${event}\ndata: ${json}\n\n`;
}

export const KEEP_ALIVE = ": keep-alive\n\n";

/**
 * Incremental parser. Handles arbitrary chunk boundaries, CRLF, comments, multiple
 * `data:` lines, and drops a final partial record on `end()`.
 */
export function createSseParser(onRecord: (r: SseRecord) => void) {
  let buffer = "";
  let id: string | undefined;
  let event = "message";
  let data: string[] = [];
  let hasField = false;

  function dispatch() {
    if (hasField && data.length > 0) onRecord({ id, event, data: data.join("\n") });
    event = "message";
    data = [];
    hasField = false;
  }

  function line(l: string) {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;
    const i = l.indexOf(":");
    const field = i === -1 ? l : l.slice(0, i);
    let value = i === -1 ? "" : l.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    hasField = true;
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }

  return {
    feed(chunk: string) {
      buffer += chunk;
      let m: RegExpExecArray | null;
      const re = /\r\n|\r|\n/g;
      let start = 0;
      while ((m = re.exec(buffer)) !== null) {
        // A lone \r at the end may be the first half of \r\n; wait for more.
        if (m[0] === "\r" && m.index === buffer.length - 1) break;
        line(buffer.slice(start, m.index));
        start = m.index + m[0].length;
      }
      buffer = buffer.slice(start);
    },
    /** End of stream: an unterminated record is discarded, never dispatched. */
    end() {
      buffer = "";
      data = [];
      hasField = false;
    },
  };
}

/** Parses a record's JSON data; returns undefined for malformed data. */
export function parseSseData(r: SseRecord): unknown {
  try {
    return JSON.parse(r.data);
  } catch {
    return undefined;
  }
}
