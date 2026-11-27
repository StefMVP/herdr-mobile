import { test, expect } from "bun:test";
import { encode, FrameReader, applyEvent, type Terminal } from "../server/core.ts";
import { check, authConfig, type AuthConfig } from "../server/auth.ts";
import { prepareHtml, renderMarkdownPage } from "../server/render.ts";
import { resolveUnder, pickMain, titleOf, rootsFromEnv, labelRoots } from "../server/reports.ts";
import { lastSaid } from "../server/peek.ts";
import { kindOf, inbox, leadOf, homeLink, linkPattern, findTerm, type State, type T } from "../web/src/model.ts";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("frames survive arbitrary chunk boundaries", () => {
  const a = encode(0, 0, new TextEncoder().encode('{"id":1}'));
  const b = encode(7, 2, new Uint8Array([1, 2, 3]));
  const all = new Uint8Array([...a, ...b]);
  for (let cut = 0; cut <= all.length; cut++) {
    const r = new FrameReader();
    const got = [...r.push(all.slice(0, cut)), ...r.push(all.slice(cut))];
    expect(got.map(([c, k, p]) => [c, k, p.length])).toEqual([[0, 0, 8], [7, 2, 3]]);
  }
});

test("events update, replace and remove terminal records", () => {
  const m = new Map<string, Terminal>([["t1", { address: "t1", turn: 1, labels: {}, state: "live" }]]);
  expect(applyEvent(m, { type: "turn", terminal: "t1", data: { turn: 2 } })).toBe(true);
  expect(m.get("t1")!.turn).toBe(2);
  applyEvent(m, { type: "labels", terminal: "t1", data: { labels: { "herdr.seen": "2" } } });
  expect(m.get("t1")!.labels["herdr.seen"]).toBe("2");
  applyEvent(m, { type: "created", terminal: "t2", data: { address: "t2", state: "live" } });
  expect(m.has("t2")).toBe(true);
  applyEvent(m, { type: "removed", terminal: "t2", data: {} });
  expect(m.has("t2")).toBe(false);
  expect(applyEvent(m, { type: "turn", terminal: "nope", data: { turn: 1 } })).toBe(false);
});

const cfg: AuthConfig = { logins: new Set(["ana@example.com"]), devices: new Set(["desk", "ana-phone"]) };
const req = (h: Record<string, string>) => new Request("https://desk.example/", { headers: h });
const who = (map: Record<string, [string, string]>) => async (ip: string) => map[ip] ? { Node: { ComputedName: map[ip][0] }, UserProfile: { LoginName: map[ip][1] } } : null;
test("only the allowed login on allowed devices gets in", async () => {
  const run = who({ "100.1.1.1": ["ana-phone", "ana@example.com"], "100.2.2.2": ["mini1", "ana@example.com"], "100.3.3.3": ["bos-laptop", "bo@example.com"] });
  const ok = await check(req({ "tailscale-user-login": "ana@example.com", "x-forwarded-for": "100.1.1.1" }), "127.0.0.1", cfg, run);
  expect(ok.ok).toBe(true);
  expect((await check(req({ "tailscale-user-login": "ana@example.com", "x-forwarded-for": "100.2.2.2" }), "127.0.0.1", cfg, run)).ok).toBe(false);
  expect((await check(req({ "tailscale-user-login": "bo@example.com", "x-forwarded-for": "100.3.3.3" }), "127.0.0.1", cfg, run)).ok).toBe(false);
  // A spoofed login header from another person's device fails the whois match.
  expect((await check(req({ "tailscale-user-login": "ana@example.com", "x-forwarded-for": "100.3.3.3" }), "127.0.0.1", cfg, run)).ok).toBe(false);
  expect((await check(req({}), "127.0.0.1", cfg, run)).ok).toBe(false);
  expect((await check(req({ "tailscale-user-login": "ana@example.com", "x-forwarded-for": "100.1.1.1" }), "100.1.1.1", cfg, run)).ok).toBe(false);
});

const t = (o: Partial<T>): T => ({ a: "t1", name: null, title: "", cwd: "/x", live: true, st: "idle", msg: null, app: "claude", turn: 0, seen: null, pin: false, space: null, tab: null, role: null, parent: null, cols: 80, rows: 24, created: 0, changed: 0, ...o });
test("inbox kinds follow docs/labels.md", () => {
  expect(kindOf(t({ st: "blocked" }))).toBe("needs");
  expect(kindOf(t({ st: "working", turn: 5, seen: 1 }))).toBe("working");
  expect(kindOf(t({ st: "idle", turn: 5, seen: 4 }))).toBe("done");
  expect(kindOf(t({ st: "done", turn: 5, seen: 5 }))).toBe("idle");
  expect(kindOf(t({ st: "done", seen: null }))).toBe("done");
});
test("inbox puts pinned first, then needs/done/working/idle; helpers fold into the parent", () => {
  const s: State = { up: true, core: "desk", at: 0, spaces: [], terminals: [
    t({ a: "w", st: "working", changed: 5 }), t({ a: "n", st: "blocked", changed: 1 }), t({ a: "p", st: "idle", pin: true }),
    t({ a: "d", st: "idle", turn: 3, seen: 2 }), t({ a: "k", st: "working", parent: "desk/w" }), t({ a: "sh", st: null }),
  ] };
  expect(inbox(s).map((r) => r.t.a)).toEqual(["p", "n", "d", "w"]);
  expect(inbox(s).find((r) => r.t.a === "w")!.kids.map((k) => k.a)).toEqual(["k"]);
  // A helper that needs you lifts its parent's row.
  s.terminals.find((x) => x.a === "k")!.st = "blocked";
  expect(inbox(s).find((r) => r.t.a === "w")!.kind).toBe("needs");
});

test("leads mode: one row per space; the lead label wins, else the first pane; others count as helpers", () => {
  const tab = (...ts: string[]) => ({ id: "tb", name: "1", root: { d: "row" as const, c: ts.map((x) => ({ t: x })) } });
  const s: State = { up: true, core: "desk", at: 0, terminals: [
    t({ a: "first", st: "idle", created: 1 }), t({ a: "boss", st: "idle", lead: true, created: 2 }), t({ a: "w", st: "working" }),
    t({ a: "h", st: "blocked", parent: "desk/w" }), t({ a: "solo", st: "working", changed: 9 }),
    t({ a: "x1", st: "working", created: 5 }), t({ a: "x2", st: "idle", created: 6 }),
  ], spaces: [
    { id: "A", name: "A", folder: "/a", tabs: [tab("first", "boss"), { ...tab("w"), id: "tb2" }] },
    { id: "B", name: "B", folder: "/b", tabs: [tab("x2", "x1")] },
  ] };
  expect(leadOf(s, s.spaces[0])!.a).toBe("boss");
  expect(leadOf(s, s.spaces[1])!.a).toBe("x2");
  const rows = inbox(s, "", "leads");
  expect(rows.map((r) => r.t.a)).toEqual(["boss", "solo", "x2"]);
  const a = rows.find((r) => r.t.a === "boss")!;
  expect(a.kids.map((k) => k.a).sort()).toEqual(["first", "h", "w"]);
  expect(a.kind).toBe("needs"); // its helper h is blocked
  expect(inbox(s).length).toBe(6); // "all" keeps every top-level agent
});

test("lastSaid takes the newest prose paragraph above the input box", () => {
  const agy = [
    "● Explored 2 files (a.md, b.md)",
    "  Started the gateway and launched the replay of",
    "  tape.json. Waiting for the render to finish.",
    "○ Thought for 6.1s (Conditional check on gate...)",
    "○ Running (python3 -c ' import socket...) (ctrl+o to expand)",
    "  Restarted the gateway and started the replay of",
    "  tape.json. Waiting for completion (~11 min).",
    "  └ Tip: Use /diff to view uncommitted changes in your",
    "  ▸ <hc from=\"t4sj x\">x done: PR #160</hc>",
    "────────────────────────────",
    "> Accept-edits mode: file edits auto-approved (shift+tab to cycle)",
    "────────────────────────────",
    "  ● [16:09:44] python3 -c ' import socket ... running",
    "? for shortcuts                       accept-edits · Gemini",
  ].join("\n");
  expect(lastSaid(agy)).toBe("Restarted the gateway and started the replay of tape.json. Waiting for completion (~11 min).");
  const claude = ["● I fixed the flaky test.", "  It passed 5 runs.", "● Bash(bun test)", "  ⎿  10 pass", "", "✻ Cooked for 15s", "╭────╮", "│ >  │", "╰────╯"].join("\n");
  expect(lastSaid(claude)).toBe("I fixed the flaky test. It passed 5 runs.");
  expect(lastSaid("────\n> \n")).toBe("");
});

test("printed links map to the home route", () => {
  const me = { home: "/home/user", links: ["http://localhost:8766/files/"] };
  expect(homeLink("http://localhost:8766/files/code/reports/a/index.html", me)).toBe("code/reports/a/index.html");
  expect(homeLink("file:///home/user/code/x.md", me)).toBe("code/x.md");
  expect(homeLink("/srv/other/x.md", me)).toBe(null);
  expect(homeLink("https://example.com", me)).toBe(null);
  expect(homeLink("/home/user/x.md", { home: null, links: [] })).toBe(null); // home files off
  expect("see /home/user/r/a.html and https://x.dev/p".match(linkPattern(me))).toEqual(["/home/user/r/a.html", "https://x.dev/p"]);
  expect("see /home/user/r/a.html".match(linkPattern({ home: null, links: [] }))).toBe(null);
});

test("report roots: ~ and * expand; labels drop the shared folder and /reports", () => {
  const h = mkdtempSync(join(tmpdir(), "hm-home-"));
  for (const d of ["code/app-a/reports", "code/tools/reports", "code/empty", "notes"]) mkdirSync(join(h, d), { recursive: true });
  const roots = rootsFromEnv({ HM_REPORT_ROOTS: "~/code/*/reports:~/notes:~/missing" }, h);
  expect(roots.map((r) => [r.path.slice(h.length), r.label])).toEqual([["/code/app-a/reports", "code/app-a"], ["/code/tools/reports", "code/tools"], ["/notes", "notes"]]);
  expect(rootsFromEnv({ HM_REPORT_ROOTS: "~/code/*/reports" }, h).map((r) => r.label)).toEqual(["app-a", "tools"]);
  expect(labelRoots([join(h, "w/a/reports"), join(h, "w/z/b/reports"), "/srv/data/lake/reports"], h).map((r) => r.label)).toEqual(["a", "z/b", "lake"]);
  expect(rootsFromEnv({}, h)).toEqual([]); // ~/reports is the default, and it is missing here
});

test("access needs explicit logins and devices", () => {
  const c = authConfig({});
  expect(c.logins.size + c.devices.size).toBe(0);
  expect([...authConfig({ HM_ALLOWED_LOGINS: "A@x.com, b@x.com", HM_ALLOWED_DEVICES: "phone" }).logins]).toEqual(["a@x.com", "b@x.com"]);
});

test("html gets a viewport and local paths are rewritten", () => {
  const out = prepareHtml('<html><head><title>x</title></head><img src="file:///home/user/Work/a.png"><a href="/home/user/Work/b.md">', "/home/user");
  expect(out).toContain('name="viewport"');
  expect(out).toContain('src="/f/h/Work/a.png"');
  expect(out).toContain('href="/f/h/Work/b.md"');
  expect(prepareHtml('<head><meta name="viewport" content="width=device-width">').match(/viewport/g)!.length).toBe(1);
  expect(renderMarkdownPage("# T\n\n|a|b|\n|-|-|\n|1|2|", "x.md")).toContain('<div class="tw"><table>');
});

test("files cannot leave their root", async () => {
  const d = mkdtempSync(join(tmpdir(), "hm-"));
  mkdirSync(join(d, "root/sub"), { recursive: true });
  writeFileSync(join(d, "root/sub/a.md"), "# A");
  writeFileSync(join(d, "secret"), "x");
  symlinkSync(join(d, "secret"), join(d, "root/link"));
  const root = { id: "0", label: "r", path: join(d, "root") };
  expect(await resolveUnder(root, "sub/a.md")).toBe(join(d, "root/sub/a.md"));
  expect(await resolveUnder(root, "../secret")).toBe(null);
  expect(await resolveUnder(root, "link")).toBe(null);
});

test("main document prefers a shallow index", () => {
  const f = (p: string, kind: any, mtime = 0) => ({ p, kind, size: 1, mtime });
  expect(pickMain([f("g/deep/x/report.md", "md", 9), f("g/index.html", "html", 1)])!.p).toBe("g/index.html");
  expect(pickMain([f("g/a.md", "md", 1), f("g/b.html", "html", 0)])!.p).toBe("g/b.html");
  expect(titleOf("html", "<title>A &amp; B</title>")).toBe("A & B");
  expect(titleOf("md", "intro\n# Heading *x*\n")).toBe("Heading x");
});

test("a terminal route finds its terminal by address or by name", () => {
  const s: State = { up: true, core: "desk", at: 0, spaces: [], terminals: [t({ a: "t9", name: "hm-e2e" })] };
  expect(findTerm(s, "t9")?.a).toBe("t9");
  expect(findTerm(s, "hm-e2e")?.a).toBe("t9");
  expect(findTerm(s, "nope")).toBeUndefined();
});
