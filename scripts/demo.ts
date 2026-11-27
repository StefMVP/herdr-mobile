// Demo server with made-up sample data, for screenshots and for a look at the app without herdr-core.
// Usage: bun run build && bun scripts/demo.ts   (then open http://127.0.0.1:7799)
import { join } from "node:path";

const DIST = join(import.meta.dir, "../web/dist");
const PORT = Number(process.env.HM_DEMO_PORT ?? 7799);
const now = Date.now();
const min = 60_000;

const t = (a: string, o: Record<string, unknown>) => ({
  a, name: null, title: "", cwd: "/home/user/code", live: true, st: "idle", msg: null, app: "claude-code", turn: 4, seen: 4, pin: false,
  space: null, tab: null, role: null, parent: null, lead: false, branch: null, cols: 60, rows: 30, created: now - 90 * min, changed: now - 5 * min, ...o,
});
const terminals = [
  t("t1", { space: "s1", lead: true, st: "working", msg: "Adding the checkout page tests", cwd: "/home/user/code/shop", branch: "main", changed: now - 20_000 }),
  t("t2", { space: "s1", st: "working", app: "codex", cwd: "/home/user/code/shop/.worktrees/cart-totals", branch: "feat/cart-totals", changed: now - 2 * min }),
  t("t3", { space: "s1", st: "idle", turn: 6, seen: 5, app: "opencode", cwd: "/home/user/code/shop/.worktrees/fix-coupon", branch: "fix/coupon-rounding", changed: now - 7 * min }),
  t("t4", { space: "s2", lead: true, st: "blocked", msg: "Approve the database migration?", cwd: "/home/user/code/api", branch: "feat/invoices", changed: now - 1 * min }),
  t("t5", { space: "s3", lead: true, st: "idle", turn: 9, seen: 8, msg: "Docs site deployed to staging", cwd: "/home/user/code/docs", branch: "main", changed: now - 12 * min }),
  t("t6", { space: "s4", lead: true, st: "idle", turn: 3, seen: 3, app: "codex", msg: "Benchmarks finished", cwd: "/home/user/code/bench", branch: "main", changed: now - 3 * 3600_000 }),
];
const tab = (id: string, name: string, ...ts: string[]) => ({ id, name, root: { d: "row", c: ts.map((x) => ({ t: x })) } });
const state = {
  up: true, core: "devbox", at: now, terminals,
  spaces: [
    { id: "s1", name: "shop", folder: "/home/user/code/shop", tabs: [tab("a", "Checkout tests", "t1"), tab("b", "cart-totals", "t2"), tab("c", "fix-coupon", "t3")] },
    { id: "s2", name: "api", folder: "/home/user/code/api", tabs: [tab("d", "Invoices", "t4")] },
    { id: "s3", name: "docs", folder: "/home/user/code/docs", tabs: [tab("e", "Release notes", "t5")] },
    { id: "s4", name: "bench", folder: "/home/user/code/bench", tabs: [tab("f", "1", "t6")] },
  ],
};
const peek: Record<string, string> = {
  t1: "The cart and payment steps pass. I am adding tests for the address form next.",
  t2: "Totals now include tax per line. Running the price tests again.",
  t3: "Coupons now round to the cent. PR #42 is open.",
};
const group = (k: string, n: string, r: string, title: string, m: number, d = 1, i = 0) =>
  ({ k: `0:${k}`, n, r, m: now - m, main: { p: `${k}/index.html`, k: "html", t: title }, d, i });
const reports = {
  scannedAt: now,
  roots: [{ id: "0", label: "shop", path: "/home/user/code/shop/reports" }],
  groups: [
    group("perf", "perf", "shop", "Checkout speed: before and after", 25 * min, 3, 12),
    group("a11y", "a11y", "shop", "Accessibility review of the cart", 2 * 3600_000),
    group("deps", "deps", "api", "Dependency update plan", 5 * 3600_000, 2),
    group("errors", "errors", "api", "Error budget for November", 26 * 3600_000),
    group("release", "release", "docs", "Release 2.4 notes", 3 * 86400_000, 1, 4),
  ],
};
const TRANSCRIPT = [
  "\x1b[1m> Add tests for the checkout page\x1b[0m", "",
  "\x1b[36m●\x1b[0m I read the checkout flow: cart, address, payment, confirm.", "",
  "\x1b[36m●\x1b[0m Bash(bun test checkout)",
  "  \x1b[2m⎿  12 pass, 0 fail\x1b[0m", "",
  "\x1b[36m●\x1b[0m The cart and payment steps pass. I am adding tests",
  "  for the address form next.", "",
  "\x1b[35m✻\x1b[0m Writing tests… \x1b[2m(42s)\x1b[0m", "",
].join("\r\n");

const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
Bun.serve({
  hostname: "127.0.0.1", port: PORT,
  async fetch(req, server) {
    const p = new URL(req.url).pathname;
    if (p === "/ws/term") return server.upgrade(req) ? undefined : new Response("upgrade", { status: 400 });
    if (p === "/api/events") {
      return new Response(new ReadableStream({ start(c) { c.enqueue(`data: ${JSON.stringify(state)}\n\n`); } }), { headers: { "content-type": "text/event-stream" } });
    }
    if (p === "/api/state") return json(state);
    if (p === "/api/me") return json({ login: "demo@example.com", device: "phone", core: "devbox", up: true, home: null, links: [], features: { app: true, dictate: true } });
    if (p === "/api/reports") return json(reports);
    if (p === "/api/peek") return json(peek);
    if (p === "/api/folders") return json([]);
    if (p === "/api/read") return json({ text: TRANSCRIPT.replace(/\x1b\[[0-9;]*m/g, "") });
    if (req.method === "POST") return json({ ok: true });
    if (p.startsWith("/f/")) return new Response("<h1>Sample report</h1>", { headers: { "content-type": "text/html" } });
    const file = Bun.file(join(DIST, p === "/" ? "index.html" : p.slice(1)));
    return (await file.exists()) && !p.includes("..") ? new Response(file) : new Response(Bun.file(join(DIST, "index.html")));
  },
  websocket: {
    open(ws) { ws.send(JSON.stringify({ t: "attached", terminal: "t1" })); ws.send(new TextEncoder().encode(TRANSCRIPT)); },
    message() {},
  },
});
console.log(`demo on http://127.0.0.1:${PORT}`);
