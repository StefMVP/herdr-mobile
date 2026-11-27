// One framed connection to herdr-core through `hc connect`.
// Channel 0 carries JSON-RPC; other channels carry event and terminal streams.

export const DATA = 0, CREDIT = 1, CLOSE = 2, RESIZE = 3, FOCUS = 4;
const HEADER = 9;

export function encode(channel: number, kind: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER + payload.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, channel, true);
  out[4] = kind;
  v.setUint32(5, payload.length, true);
  out.set(payload, HEADER);
  return out;
}

/** Splits a byte stream into frames; keeps the incomplete tail. */
export class FrameReader {
  private buf = new Uint8Array(0);
  push(chunk: Uint8Array): Array<[number, number, Uint8Array]> {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    const frames: Array<[number, number, Uint8Array]> = [];
    let at = 0;
    while (merged.length - at >= HEADER) {
      const v = new DataView(merged.buffer, merged.byteOffset + at);
      const len = v.getUint32(5, true);
      if (merged.length - at < HEADER + len) break;
      frames.push([v.getUint32(0, true), merged[at + 4], merged.slice(at + HEADER, at + HEADER + len)]);
      at += HEADER + len;
    }
    this.buf = merged.slice(at);
    return frames;
  }
}

export type Terminal = Record<string, any> & { address: string };
export type StreamHandler = { data(bytes: Uint8Array): void; closed(why: any): void };

const enc = new TextEncoder();
const dec = new TextDecoder();

export class Core {
  hello: any = null;
  terminals = new Map<string, Terminal>();
  doc: any = null;
  docVersion = 0;
  up = false;
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private nextId = 1;
  private replies = new Map<number, (msg: any) => void>();
  private streams = new Map<number, StreamHandler>();
  private early = new Map<number, Array<[number, Uint8Array]>>();
  private eventChannel = -1;
  private eventTail = "";
  private seq = 0;
  private listeners = new Set<(what: "terminals" | "doc" | "up") => void>();
  private hcBin: string;

  constructor(hcBin = "hc") { this.hcBin = hcBin; }

  onChange(fn: (what: "terminals" | "doc" | "up") => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(what: "terminals" | "doc" | "up") { for (const fn of this.listeners) fn(what); }

  /** Connects, subscribes and reconnects forever. */
  async run() {
    for (;;) {
      try { await this.session(); } catch (e) { console.error("core session:", (e as Error).message); }
      this.up = false;
      this.emit("up");
      for (const [, h] of this.streams) h.closed({ reason: "lost" });
      this.streams.clear();
      for (const [, r] of this.replies) r({ error: { message: "lost the core" } });
      this.replies.clear();
      await Bun.sleep(2000);
    }
  }

  private async session() {
    const proc = Bun.spawn([this.hcBin, "connect"], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
    this.proc = proc;
    (proc.stdin as any).write(enc.encode(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "hello", params: { generation: 1, framed: true } }) + "\n"));
    (proc.stdin as any).flush();
    const reader = new FrameReader();
    let line = new Uint8Array(0);
    let framed = false;
    const done = (async () => {
      for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
        let bytes = chunk;
        if (!framed) {
          const merged = new Uint8Array(line.length + bytes.length);
          merged.set(line); merged.set(bytes, line.length);
          const nl = merged.indexOf(10);
          if (nl < 0) { line = merged; continue; }
          this.hello = JSON.parse(dec.decode(merged.slice(0, nl))).result;
          framed = true;
          bytes = merged.slice(nl + 1);
          queueMicrotask(() => this.ready().catch((e) => { console.error("core ready:", e.message); proc.kill(); }));
        }
        for (const [ch, kind, payload] of reader.push(bytes)) this.frame(ch, kind, payload);
      }
    })();
    await done;
    await proc.exited;
  }

  private async ready() {
    const sub = await this.call("events.subscribe", {});
    this.eventChannel = sub.channel;
    this.seq = sub.seq ?? 0;
    this.terminals = new Map((sub.terminals ?? []).map((t: Terminal) => [t.address, t]));
    for (const [kind, p] of this.early.get(this.eventChannel) ?? []) this.frame(this.eventChannel, kind, p);
    this.early.delete(this.eventChannel);
    this.credit(this.eventChannel, 1 << 20);
    await this.loadDoc();
    this.up = true;
    this.emit("up");
    this.emit("terminals");
  }

  async loadDoc() {
    const r = await this.call("doc.get", { name: "herdr-app" });
    this.doc = r.value ?? { spaces: [] };
    this.docVersion = r.version ?? 0;
    this.emit("doc");
  }

  private frame(channel: number, kind: number, payload: Uint8Array) {
    if (channel === 0) {
      const msg = JSON.parse(dec.decode(payload));
      const r = msg.id != null ? this.replies.get(msg.id) : undefined;
      if (r) { this.replies.delete(msg.id); r(msg); }
      return;
    }
    if (channel === this.eventChannel) {
      if (kind === DATA) { this.credit(channel, payload.length); this.events(payload); }
      return;
    }
    const h = this.streams.get(channel);
    if (!h) {
      if (!this.early.has(channel)) this.early.set(channel, []);
      this.early.get(channel)!.push([kind, payload]);
      return;
    }
    if (kind === DATA) h.data(payload);
    else if (kind === CLOSE) { this.streams.delete(channel); h.closed(safeJson(payload)); }
  }

  private events(bytes: Uint8Array) {
    const text = this.eventTail + dec.decode(bytes, { stream: true });
    const lines = text.split("\n");
    this.eventTail = lines.pop() ?? "";
    let terminals = false, doc = false;
    for (const l of lines) {
      if (!l) continue;
      const m = safeJson(enc.encode(l));
      const p = m?.params ?? {};
      if (m?.method === "missed") {
        this.terminals = new Map((p.terminals ?? []).map((t: Terminal) => [t.address, t]));
        this.seq = p.seq ?? this.seq;
        terminals = doc = true;
      } else if (m?.method === "event" && (p.seq == null || p.seq > this.seq)) {
        this.seq = p.seq ?? this.seq;
        if (p.type === "doc") doc = true;
        else terminals = applyEvent(this.terminals, p) || terminals;
      }
    }
    if (terminals) this.emit("terminals");
    if (doc) this.loadDoc().catch(() => {});
  }

  send(channel: number, kind: number, payload: Uint8Array) {
    if (!this.proc) return;
    try { (this.proc.stdin as any).write(encode(channel, kind, payload)); (this.proc.stdin as any).flush(); } catch {}
  }

  credit(channel: number, n: number) {
    const p = new Uint8Array(4); new DataView(p.buffer).setUint32(0, n, true);
    this.send(channel, CREDIT, p);
  }

  call(method: string, params: any, timeoutMs = 10000): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.replies.delete(id); reject(new Error(`${method}: no reply from core`)); }, timeoutMs);
      this.replies.set(id, (msg) => {
        clearTimeout(t);
        if (msg.error) reject(Object.assign(new Error(msg.error.message ?? "core error"), { data: msg.error.data }));
        else resolve(msg.result);
      });
      this.send(0, DATA, enc.encode(JSON.stringify({ jsonrpc: "2.0", id, method, params })));
    });
  }

  async attach(terminal: string, cols: number, rows: number, handler: StreamHandler, history = 1000, display: any = null) {
    const r = await this.call("terminal.attach", { terminal, cols, rows, history, ...(display ? { display } : {}) });
    const ch = r.channel as number;
    this.streams.set(ch, handler);
    for (const [kind, p] of this.early.get(ch) ?? []) this.frame(ch, kind, p);
    this.early.delete(ch);
    return { channel: ch, automatic: r.automatic_input === true, terminal: r.terminal };
  }

  detach(channel: number) {
    if (!this.streams.delete(channel)) return;
    this.send(channel, CLOSE, new Uint8Array(0));
  }

  resize(channel: number, cols: number, rows: number) {
    const p = new Uint8Array(4); const v = new DataView(p.buffer);
    v.setUint16(0, cols, true); v.setUint16(2, rows, true);
    this.send(channel, RESIZE, p);
  }
}

function safeJson(b: Uint8Array): any { try { return JSON.parse(dec.decode(b)); } catch { return null; } }

/** One event's change to the terminal it names. Returns whether anything changed. */
export function applyEvent(terminals: Map<string, Terminal>, p: any): boolean {
  const { type, terminal: address, data = {} } = p;
  const whole = type === "created" || type === "restarted" ? data : type === "labels" ? data.record : null;
  if (whole) { terminals.set(address, whole); return true; }
  const t = terminals.get(address);
  if (!t) return false;
  const set = (keys: string[]) => keys.forEach((k) => (t[k] = data[k]));
  switch (type) {
    case "removed": terminals.delete(address); return true;
    case "finished": case "lost":
      set(["reason", "exit_code", "signal", "finished_ms"]);
      t.state = type === "lost" ? "live" : "finished";
      if (type === "lost") t.pid = null;
      delete t.foreground;
      return true;
    case "status": set(["status", "records", "reported"]); t.status_ms = Date.now(); return true;
    case "turn": set(["turn"]); return true;
    case "title": set(["title"]); return true;
    case "labels": t.labels = data.labels; return true;
    case "keep": set(["keep"]); return true;
    case "size": set(["cols", "rows"]); return true;
    case "foreground": t.foreground = data; return true;
  }
  return false;
}
