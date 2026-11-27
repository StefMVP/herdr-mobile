import { Core, DATA, FOCUS } from "./core.ts";
import { authConfig, check, sameOriginWrite } from "./auth.ts";
import { ReportIndex, rootsFromEnv, resolveUnder, type Group } from "./reports.ts";
import { renderMarkdownPage, prepareHtml } from "./render.ts";
import { slimState } from "./state.ts";
import { lastSaid } from "./peek.ts";
import { closeTerminal, closeSpace, newSpace, folders, dictate } from "./app.ts";
import { join, extname, basename } from "node:path";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";

// Optional (HM_HOME_FILES=1): open files in the home folder that agents print as paths.
// Not indexed. Hidden files and folders stay closed.
const HOME = { id: "h", label: "home", path: homedir() };
const HOME_FILES = process.env.HM_HOME_FILES === "1";
// URL prefixes that agents print for files in the home folder (for example a local file server).
const LINK_PREFIXES = (process.env.HM_LINK_PREFIXES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Optional tools: the Herdr app (new and close space) and Hex with ffmpeg (dictation).
const FEATURES = { app: !!Bun.which(process.env.HM_APP ?? "herdr-app"), dictate: !!Bun.which(process.env.HM_HEX ?? "hex") && !!Bun.which("ffmpeg") };

const PORT = Number(process.env.HM_PORT ?? 7791);
const DIST = join(import.meta.dir, "../web/dist");
const cfg = authConfig();
if (!cfg.logins.size || !cfg.devices.size) {
  console.error("Set HM_ALLOWED_LOGINS and HM_ALLOWED_DEVICES (comma-separated Tailscale logins and device names).");
  process.exit(1);
}
const core = new Core(process.env.HM_HC ?? "hc");
const index = new ReportIndex(rootsFromEnv());
core.run();
index.refresh();
setInterval(() => index.refresh(), 120_000);

// ---- live state to browsers (Server-Sent Events) ----
const subscribers = new Set<(chunk: string) => void>();
let stateJson = "";
let pushTimer: Timer | null = null;
function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    stateJson = JSON.stringify(slimState(core));
    for (const s of subscribers) s(`data: ${stateJson}\n\n`);
  }, 80);
}
core.onChange(schedulePush);
setInterval(() => { for (const s of subscribers) s(`: ping\n\n`); }, 20_000);

// ---- small gzip cache for text bodies ----
const gz = new Map<string, Uint8Array<ArrayBuffer>>();
let gzBytes = 0;
function gzipCached(key: string, body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const hit = gz.get(key);
  if (hit) return hit;
  const z = Bun.gzipSync(body, { level: 6 });
  gz.set(key, z); gzBytes += z.length;
  while (gzBytes > 64 << 20) { const [k, v] = gz.entries().next().value!; gz.delete(k); gzBytes -= v.length; }
  return z;
}
const TEXT = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;
function send(req: Request, body: Uint8Array<ArrayBuffer> | string, type: string, headers: Record<string, string> = {}, cacheKey?: string) {
  const bytes: Uint8Array<ArrayBuffer> = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const h: Record<string, string> = { "content-type": type, "x-content-type-options": "nosniff", ...headers };
  if (bytes.length > 1024 && TEXT.test(type) && (req.headers.get("accept-encoding") ?? "").includes("gzip")) {
    h["content-encoding"] = "gzip"; h["vary"] = "accept-encoding";
    return new Response(cacheKey ? gzipCached(cacheKey, bytes) : Bun.gzipSync(bytes), { headers: h });
  }
  return new Response(bytes, { headers: h });
}
const json = (req: Request, v: unknown, status = 200) => status === 200 ? send(req, JSON.stringify(v), "application/json", { "cache-control": "no-store" }) : Response.json(v, { status });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".csv": "text/plain; charset=utf-8",
};
// Reports run as an opaque origin: their scripts work, but they cannot read our API or reach the terminal socket.
const REPORT_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads";

async function serveDist(req: Request, path: string) {
  const file = Bun.file(join(DIST, path));
  if (!(await file.exists())) return null;
  const type = MIME[extname(path)] ?? "application/octet-stream";
  const immutable = /\/chunk-|\.[0-9a-z]{8}\.(js|css)$/.test(path);
  const cache = immutable ? "public, max-age=31536000, immutable" : "no-cache";
  const st = await stat(join(DIST, path));
  return send(req, new Uint8Array(await file.arrayBuffer()), type, { "cache-control": cache }, `dist:${path}:${st.mtimeMs}`);
}

async function serveReportFile(req: Request, url: URL, rootId: string, rel: string) {
  const root = rootId === "h" ? (HOME_FILES ? HOME : undefined) : index.rootById(rootId);
  if (!root) return new Response("no such root", { status: 404 });
  if (rootId === "h" && rel.split("/").some((part) => part.startsWith("."))) return new Response("hidden", { status: 403 });
  const full = await resolveUnder(root, rel);
  if (!full) return new Response("not found", { status: 404 });
  const st = await stat(full).catch(() => null);
  if (!st) return new Response("not found", { status: 404 });
  if (st.isDirectory()) {
    for (const n of ["index.html", "report.html", "README.md", "report.md"]) {
      if (await Bun.file(join(full, n)).exists()) return Response.redirect(`${url.pathname.replace(/\/$/, "")}/${n}`, 302);
    }
    return new Response("folder", { status: 404 });
  }
  const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  const ext = extname(full).toLowerCase();
  const base = { etag, "cache-control": "private, no-cache", "content-security-policy": REPORT_CSP };
  const key = `${full}:${st.mtimeMs}`;
  if ((ext === ".md" || ext === ".markdown") && !url.searchParams.has("raw")) {
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
    const html = renderMarkdownPage(await Bun.file(full).text(), basename(full), theme);
    return send(req, html, "text/html; charset=utf-8", base, `md:${theme}:${key}`);
  }
  if ((ext === ".html" || ext === ".htm") && !url.searchParams.has("raw")) {
    return send(req, prepareHtml(await Bun.file(full).text(), HOME_FILES ? HOME.path : ""), "text/html; charset=utf-8", base, `html:${key}`);
  }
  const type = MIME[ext] ?? "application/octet-stream";
  if (TEXT.test(type) && st.size < 16 << 20) return send(req, new Uint8Array(await Bun.file(full).arrayBuffer()), type, base, `raw:${key}`);
  return new Response(Bun.file(full), { headers: { ...base, "content-type": type } });
}

function slimGroup(g: Group) {
  const r = index.rootById(g.root)!;
  return { k: g.key, n: g.name, r: r.label, m: g.mtime, main: g.main && { p: g.main.p, k: g.main.kind, t: g.main.title }, d: g.docs.length, i: g.imageCount };
}

// ---- terminal sockets ----
type WsData = { terminal: string; cols: number; rows: number; channel: number; display: { bg: string; fg: string; cursor: string } };

const server = Bun.serve<WsData>({
  hostname: "127.0.0.1",
  port: PORT,
  idleTimeout: 120,
  async fetch(req, server) {
    const url = new URL(req.url);
    const verdict = await check(req, server.requestIP(req)?.address, cfg);
    if (!verdict.ok) return new Response(`Forbidden: ${verdict.why}\n`, { status: 403 });
    const p = url.pathname;

    if (p === "/ws/term") {
      const origin = req.headers.get("origin");
      if (origin && origin !== `https://${req.headers.get("host")}`) return new Response("bad origin", { status: 403 });
      const terminal = url.searchParams.get("t") ?? "";
      const cols = clamp(Number(url.searchParams.get("cols")), 20, 400, 80);
      const rows = clamp(Number(url.searchParams.get("rows")), 5, 200, 24);
      const hex = (v: string | null, d: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
      const fg = hex(url.searchParams.get("fg"), "#e6e6ea");
      const display = { bg: hex(url.searchParams.get("bg"), "#1f2026"), fg, cursor: fg };
      if (server.upgrade(req, { data: { terminal, cols, rows, channel: -1, display } })) return;
      return new Response("upgrade failed", { status: 400 });
    }
    if (p === "/api/events") {
      let ctl: ReadableStreamDefaultController<string>;
      const push = (s: string) => { try { ctl.enqueue(s); } catch {} };
      const stream = new ReadableStream<string>({
        start(c) { ctl = c; c.enqueue(`retry: 1500\ndata: ${stateJson || JSON.stringify(slimState(core))}\n\n`); subscribers.add(push); },
        cancel() { subscribers.delete(push); },
      });
      req.signal.addEventListener("abort", () => subscribers.delete(push));
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }
    if (p === "/api/state") return json(req, slimState(core));
    if (p === "/api/me") return json(req, { login: verdict.login, device: verdict.device, core: core.hello?.core?.name ?? null, up: core.up, home: HOME_FILES ? HOME.path : null, links: LINK_PREFIXES, features: FEATURES });
    if (p === "/api/reports") {
      if (!index.scannedAt) await index.refresh();
      else if (url.searchParams.has("fresh")) await index.refresh();
      return json(req, { scannedAt: index.scannedAt, scanMs: index.scanMs, roots: index.roots.map((r) => ({ id: r.id, label: r.label, path: r.path })), groups: index.groups.map(slimGroup) });
    }
    if (p === "/api/reports/group") {
      const g = await index.groupDetail(url.searchParams.get("k") ?? "");
      if (!g) return json(req, { error: "not found" }, 404);
      return json(req, { ...slimGroup(g), path: index.rootById(g.root)!.path, docs: g.docs.slice(0, 300).map((f) => ({ p: f.p, k: f.kind, t: f.title, s: f.size, m: f.mtime })), images: g.images.map((f) => ({ p: f.p, s: f.size, m: f.mtime })) });
    }
    if (p === "/api/templates") return json(req, await core.call("templates.list", {}).catch(() => ({ templates: [] })));
    if (p === "/api/read") {
      const t = url.searchParams.get("t") ?? "";
      try { return json(req, await core.call("terminal.read", { terminal: t, lines: clamp(Number(url.searchParams.get("lines")), 0, 5000, 400) })); }
      catch (e) { return json(req, { error: (e as Error).message }, 502); }
    }
    if (p === "/api/folders") return json(req, await folders());
    if (p === "/api/peek") {
      const ts = (url.searchParams.get("t") ?? "").split(",").filter(Boolean).slice(0, 24);
      const out: Record<string, string> = {};
      await Promise.all(ts.map(async (t) => { try { out[t] = lastSaid(String((await core.call("terminal.read", { terminal: t, lines: 0 }, 5000) as any)?.text ?? "")); } catch {} }));
      return json(req, out);
    }
    if (p.startsWith("/api/") && req.method === "POST") {
      if (!sameOriginWrite(req)) return new Response("forbidden", { status: 403 });
      if (p === "/api/dictate") {
        if (!FEATURES.dictate) return json(req, { error: "dictation needs hex and ffmpeg on the server" }, 501);
        const audio = new Uint8Array(await req.arrayBuffer());
        if (!audio.length || audio.length > 25e6) return json(req, { error: "audio missing or too big" }, 400);
        try { return json(req, { text: await dictate(audio) }); } catch (e) { return json(req, { error: (e as Error).message }, 502); }
      }
      return handleAction(p.slice(5), await req.json().catch(() => ({})), req);
    }
    if (p.startsWith("/f/")) {
      const [, , rootId, ...rest] = p.split("/");
      return serveReportFile(req, url, rootId, decodeURIComponent(rest.join("/")));
    }
    if (p !== "/" && !p.includes("..")) {
      const r = await serveDist(req, p.slice(1));
      if (r) return r;
    }
    // App routes: /, /inbox, /spaces/..., /t/..., /reports..., /view/...
    return (await serveDist(req, "index.html")) ?? new Response("build missing: run bun run build", { status: 500 });
  },
  websocket: {
    perMessageDeflate: true,
    async open(ws) {
      const d = ws.data;
      try {
        const a = await core.attach(d.terminal, d.cols, d.rows, {
          data: (bytes) => { ws.sendBinary(bytes); core.credit(d.channel, bytes.length); },
          closed: (why) => { try { ws.send(JSON.stringify({ t: "closed", why })); ws.close(1000, "closed"); } catch {} },
        }, 2000, d.display);
        d.channel = a.channel;
        ws.send(JSON.stringify({ t: "attached", terminal: a.terminal }));
        core.send(d.channel, FOCUS, new Uint8Array([1]));
      } catch (e) {
        ws.send(JSON.stringify({ t: "error", message: (e as Error).message }));
        ws.close(1011, "attach failed");
      }
    },
    message(ws, msg) {
      const d = ws.data;
      if (d.channel < 0) return;
      if (typeof msg !== "string") { core.send(d.channel, DATA, new Uint8Array(msg as any)); return; }
      const m = JSON.parse(msg);
      if (m.t === "resize") core.resize(d.channel, clamp(m.cols, 20, 400, 80), clamp(m.rows, 5, 200, 24));
      else if (m.t === "focus") core.send(d.channel, FOCUS, new Uint8Array([m.on ? 1 : 0]));
    },
    close(ws) { if (ws.data.channel >= 0) core.detach(ws.data.channel); },
  },
});

async function handleAction(action: string, b: any, req: Request): Promise<Response> {
  const t = String(b.terminal ?? "");
  try {
    switch (action) {
      case "label": {
        const labels: Record<string, string> = {};
        for (const [k, v] of Object.entries(b.labels ?? {})) if (/^herdr\.(seen|pinned)$/.test(k)) labels[k] = String(v);
        return json(req, await core.call("terminal.label", { terminal: t, labels }));
      }
      case "keys": return json(req, await core.call("terminal.keys", { terminal: t, keys: (b.keys ?? []).map(String) }));
      case "send": return json(req, await core.call("terminal.send", { terminal: t, text: String(b.text ?? ""), wait: false }, 70_000));
      case "interrupt": return json(req, await core.call("terminal.interrupt", { terminal: t }, 20_000));
      case "put": return json(req, await core.call("terminal.put", { terminal: t, name: basename(String(b.name ?? "image.png")), data: String(b.data ?? "") }, 30_000));
      case "close": return json(req, await closeTerminal(t, (x) => core.call("terminal.kill", { terminal: x })));
      case "space/close": if (!FEATURES.app) return json(req, { error: "needs the Herdr app (herdr-app)" }, 501);
        return json(req, await closeSpace(String(b.id ?? "")));
      case "space/new": if (!FEATURES.app) return json(req, { error: "needs the Herdr app (herdr-app)" }, 501);
        return json(req, await newSpace(b));
      case "run": {
        const space = (core.doc?.spaces ?? []).find((s: any) => s.id === b.space);
        if (!space) return json(req, { error: "unknown space" }, 400);
        const line = String(b.command ?? "").trim();
        const r = await core.call("terminal.run", {
          ...(line ? { line } : {}),
          cwd: space.folder, keep: true,
          env: { TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "herdr" },
          labels: { "herdr.space": space.id, "herdr.seen": "0" },
          size: { cols: clamp(b.cols, 20, 400, 100), rows: clamp(b.rows, 5, 200, 40) },
          outlive_parent: true, no_parent: true,
        });
        return json(req, r);
      }
    }
    return json(req, { error: "unknown action" }, 404);
  } catch (e) {
    return json(req, { error: (e as Error).message, data: (e as any).data }, 502);
  }
}

function clamp(n: any, lo: number, hi: number, d: number) { n = Number(n); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; }

console.log(`herdr-mobile on http://127.0.0.1:${server.port} (roots: ${index.roots.length})`);
