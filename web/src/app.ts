import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { type State, type T, type Space, type Node, type Kind, inbox, kindOf, counts, spaceTerminals, ago, placeOf, homeLink, findTerm as findTermIn, linkPattern, type Me, rowTitle, terminalsIn, leadOf } from "./model.ts";

// ---------- helpers ----------
const $ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as E | null;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plain = (s: string | null | undefined) => (s ?? "").replace(/\*\*|__|`/g, "").replace(/^#+\s*/, "");
const app = document.getElementById("app")!;
const home = (p: string) => p.replace(/^\/home\/[^/]+/, "~");
const KIND_LABEL: Record<Kind, string> = { needs: "Needs you", done: "Done", working: "Working", idle: "Idle" };
const I = {
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M5.2 5.6A2 2 0 0 1 7 4.5h10a2 2 0 0 1 1.8 1.1L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/></svg>',
  spaces: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 14 20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>',
  kbd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 13h.01M18 13h.01M9 14.5h6"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12 14.6 8 16l1.4-4z"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 3.5h-2V11h5.5V9L22 12l-3.5 3v-2H13v5.5h2L12 22l-3-3.5h2V13H5.5v2L2 12l3.5-3v2H11V5.5H9z"/></svg>',
  spin: '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v3"/><path d="M18.4 5.6l-2.1 2.1" opacity=".9"/><path d="M21 12h-3" opacity=".8"/><path d="M18.4 18.4l-2.1-2.1" opacity=".7"/><path d="M12 21v-3" opacity=".6"/><path d="M5.6 18.4l2.1-2.1" opacity=".5"/><path d="M3 12h3" opacity=".4"/><path d="M5.6 5.6l2.1 2.1" opacity=".3"/></svg>',
  panes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16M12 12h9"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  branch: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-12 8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
};
/** Like the Herdr desktop sidebar: green with the number of agents at work, gray at 0. */
const working = (ts: T[]) => ts.filter((t) => kindOf(t) === "working").length;
const badge = (n: number) => `<span class="wk ${n ? "on" : ""}">${n}</span>`;

async function post(action: string, body: unknown) {
  const r = await fetch(`/api/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-hm": "1" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
function toast(text: string) {
  document.querySelectorAll(".toast").forEach((e) => e.remove());
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

// ---------- settings ----------
type Settings = { theme: "dark" | "light" | "system"; font: number; wide: boolean; banners: boolean; inbox: "leads" | "all" };
const DEFAULTS: Settings = { theme: "dark", font: 13, wide: false, banners: true, inbox: "leads" };
function settings(): Settings { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("hm.settings") ?? "{}") }; } catch { return DEFAULTS; } }
function save(p: Partial<Settings>) { localStorage.setItem("hm.settings", JSON.stringify({ ...settings(), ...p })); applyTheme(); }
function themeName(): "dark" | "light" {
  const t = settings().theme;
  return t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
}
function applyTheme() {
  const t = themeName();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#111113" : "#f2f2f7");
}
applyTheme();
matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

// ---------- this server: home folder for links, optional tools ----------
let ME: Me & { features: { app: boolean; dictate: boolean } } = { home: null, links: [], features: { app: false, dictate: false } };
const meReady = fetch("/api/me").then((r) => r.json()).then((j) => { ME = { ...ME, ...j }; }).catch(() => {});

// ---------- live state ----------
let S: State = { up: false, core: null, at: 0, spaces: [], terminals: [] };
const listeners = new Set<() => void>();
let prevKinds = new Map<string, Kind>();
let first = true;
const findTerm = (key: string) => findTermIn(S, key);

function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => {
    const next = JSON.parse(e.data) as State;
    notice(next);
    S = next;
    const c = counts(S);
    (navigator as any).setAppBadge?.(c.needs + c.done)?.catch?.(() => {});
    for (const fn of listeners) fn();
  };
  es.onerror = () => { S = { ...S, up: false }; for (const fn of listeners) fn(); };
}
function notice(next: State) {
  const kinds = new Map(next.terminals.map((t) => [t.a, kindOf(t)] as const));
  if (!first && settings().banners) {
    for (const t of next.terminals) {
      const k = kinds.get(t.a)!;
      if (t.st == null || prevKinds.get(t.a) === k || (k !== "needs" && k !== "done")) continue;
      if (route().name === "term" && findTerm(route().arg)?.a === t.a) continue;
      banner(next, t, k);
    }
  }
  prevKinds = kinds; first = false;
}
function banner(s: State, t: T, k: Kind) {
  document.querySelectorAll(".banner").forEach((e) => e.remove());
  const { project, task } = rowTitle(s, t);
  const el = document.createElement("button");
  el.className = "banner";
  el.innerHTML = `<div class="rb"><div class="l1"><b>${esc(project)}</b><span>${k === "needs" ? "needs you" : "is done"}</span></div><small>${esc(task)}</small></div>`;
  el.onclick = () => { el.remove(); go(`/t/${t.a}`); };
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}

// ---------- router ----------
type Route = { name: string; arg: string; q: URLSearchParams };
function route(): Route {
  const p = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(location.search);
  if (p[0] === "t" && p[1]) return { name: "term", arg: p.slice(1).join("/"), q };
  if (p[0] === "spaces" && p[1]) return { name: "space", arg: p[1], q };
  if (p[0] === "spaces") return { name: "spaces", arg: "", q };
  if (p[0] === "reports" && p[1] === "g") return { name: "group", arg: q.get("k") ?? "", q };
  if (p[0] === "reports") return { name: "reports", arg: "", q };
  if (p[0] === "view") return { name: "view", arg: "", q };
  if (p[0] === "settings") return { name: "settings", arg: "", q };
  return { name: "inbox", arg: "", q };
}
function go(path: string, replace = false) {
  if (replace) history.replaceState({ n: 1 }, "", path); else history.pushState({ n: 1 }, "", path);
  render();
}
function back(fallback: string) { if (history.state?.n) history.back(); else go(fallback, true); }
window.addEventListener("popstate", () => render());
document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target || a.origin !== location.origin || a.pathname.startsWith("/f/")) return;
  e.preventDefault();
  go(a.pathname + a.search);
});

let teardown: (() => void) | null = null;
let current = "";
function render() {
  const r = route();
  const key = `${r.name}:${r.arg}`;
  if (key === current) { for (const fn of listeners) fn(); return; }
  teardown?.(); teardown = null; current = key;
  listeners.clear();
  document.querySelectorAll(".scrim").forEach((e) => e.remove());
  teardown = (VIEWS[r.name] ?? VIEWS.inbox)(r) ?? null;
}
const VIEWS: Record<string, (r: Route) => (() => void) | void> = {
  inbox: viewInbox, spaces: viewSpaces, space: viewSpace, term: viewTerm, reports: viewReports, group: viewGroup, view: viewFile, settings: viewSettings,
};

// ---------- chrome ----------
function page(tab: "inbox" | "spaces" | "reports" | "", title: string, sub = "", leftBack = "") {
  app.innerHTML = `<div class="page" id="pg">
    <div class="bar">${leftBack ? `<button class="round left" id="bk" aria-label="Back">${I.back}</button>` : ""}
      ${tab === "inbox" || tab === "spaces" ? `<button class="round" id="plus" aria-label="New">${I.plus}</button>` : ""}
      ${tab ? `<a class="round" href="/settings" aria-label="Settings">${I.gear}</a>` : ""}</div>
    <h1 class="big" id="bigt">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</h1>
    <div id="main"></div></div>
    ${tab ? `<nav class="tabs">
      <a href="/inbox" class="${tab === "inbox" ? "on" : ""}">${I.inbox}Inbox<span id="ib"></span></a>
      <a href="/spaces" class="${tab === "spaces" ? "on" : ""}">${I.spaces}Spaces</a>
      <a href="/reports" class="${tab === "reports" ? "on" : ""}">${I.reports}Reports</a></nav>` : ""}`;
  $("#plus")?.addEventListener("click", spaceSheet);
  if (leftBack) $("#bk")!.onclick = () => back(leftBack);
  const badge = () => { const c = counts(S); const el = $("#ib"); if (el) el.innerHTML = c.needs ? `<span class="badge">${c.needs}</span>` : ""; };
  badge(); listeners.add(badge);
  return $("#main")!;
}
function sheet(html: string) {
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  return { el: scrim.querySelector(".sheet") as HTMLElement, close };
}

// ---------- + : jump to a space or start an agent there ----------
const AGENTS = [{ label: "Claude Code", cmd: "claude" }, { label: "Codex", cmd: "codex" }, { label: "OpenCode", cmd: "opencode" }, { label: "Antigravity", cmd: "agy" }, { label: "Shell", cmd: "" }];
function recentSpaces(): Space[] {
  const last = (sp: Space) => Math.max(0, ...spaceTerminals(S, sp).map((t) => t.changed));
  return [...S.spaces].sort((a, b) => last(b) - last(a));
}
function spaceSheet() {
  const { el, close } = sheet(`<h2>Go to a space</h2>${ME.features.app ? `<div class="group"><button class="act" data-x="newspace"><span class="grow" style="color:var(--accent);font-weight:600">+ New space</span></button></div>` : ""}
    <div class="group" style="margin-top:12px">${recentSpaces().map((sp) =>
    `<button class="act" data-go="${esc(sp.id)}">${badge(working(spaceTerminals(S, sp)))}<span class="grow">${esc(sp.name)}<small>${esc(home(sp.folder))}</small></span><span class="mini" data-new="${esc(sp.id)}">New</span></button>`).join("") || '<div class="empty">No spaces yet.</div>'}</div>`);
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-x="newspace"]')) { close(); return newSpaceSheet(); }
    const nw = t.closest("[data-new]") as HTMLElement | null;
    if (nw) { e.stopPropagation(); close(); return newSheet(nw.dataset.new!); }
    const g = t.closest("[data-go]") as HTMLElement | null;
    if (g) { close(); go(`/spaces/${g.dataset.go}`); }
  });
}
/** New space: pick a folder (repos in HM_PROJECT_DIRS), then the agent to start in it. */
async function newSpaceSheet() {
  const { el, close } = sheet(`<h2>New space</h2><label class="search">${I.search}<input id="fq" type="search" placeholder="Folder" autocomplete="off"></label><div id="fl" class="group scroll" style="margin-top:10px"><div class="empty">Loading…</div></div>`);
  const list: { path: string; name: string }[] = await fetch("/api/folders").then((r) => r.json()).catch(() => []);
  const draw = (q: string) => {
    const ql = q.toLowerCase();
    const hits = list.filter((f) => !ql || f.name.toLowerCase().includes(ql)).slice(0, 40);
    const typed = q.startsWith("~/") || q.startsWith("/") ? `<button class="act" data-f="${esc(q)}"><span class="grow">Use ${esc(q)}</span></button>` : "";
    $("#fl", el)!.innerHTML = typed + hits.map((f) => `<button class="act" data-f="${esc(f.path)}"><span class="grow">${esc(f.name.split("/").pop())}<small>~/${esc(f.name)}</small></span></button>`).join("") || `<div class="empty">No folder matches. Type a path that starts with ~/</div>`;
  };
  draw("");
  ($("#fq", el) as HTMLInputElement).oninput = (e) => draw((e.target as HTMLInputElement).value.trim());
  el.addEventListener("click", (e) => {
    const f = ((e.target as HTMLElement).closest("[data-f]") as HTMLElement | null)?.dataset.f;
    if (!f) return;
    close();
    const name = f.split("/").pop()!;
    const s2 = sheet(`<h2>Start in ${esc(name)}</h2><div class="group">${AGENTS.map((a) => `<button class="act" data-agent="${a.cmd || "shell"}"><span class="grow">${a.label}<small>${esc(a.cmd || "login shell")} · ${esc(home(f))}</small></span></button>`).join("")}</div>`);
    s2.el.addEventListener("click", async (ev) => {
      const agent = ((ev.target as HTMLElement).closest("[data-agent]") as HTMLElement | null)?.dataset.agent;
      if (!agent) return;
      s2.close();
      toast("Making the space…");
      try { const r = await post("space/new", { folder: f, agent }); go(r.terminal ? `/t/${r.terminal}` : `/spaces/${r.space}`); }
      catch (err) { toast(`Could not make the space: ${(err as Error).message}`); }
    });
  });
}
function newSheet(spaceId: string) {
  const sp = S.spaces.find((s) => s.id === spaceId);
  if (!sp) return;
  const { el, close } = sheet(`<h2>New in ${esc(sp.name)}</h2><div class="group">${AGENTS.map((a) => `<button class="act" data-cmd="${esc(a.cmd)}"><span class="grow">${a.label}<small>${esc(a.cmd || "login shell")} · ${esc(home(sp.folder))}</small></span></button>`).join("")}</div>`);
  el.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest("[data-cmd]") as HTMLElement | null;
    if (!b) return;
    close();
    try { const r = await post("run", { space: sp.id, command: b.dataset.cmd, ...phoneSize() }); go(`/t/${r.address}`); }
    catch (err) { toast(`Could not start: ${(err as Error).message}`); }
  });
}

// ---------- inbox ----------
const leadSet = () => new Set(S.spaces.map((sp) => leadOf(S, sp)?.a).filter(Boolean) as string[]);
function rowHtml(t: T, kind: Kind, kids: T[] = [], opt: { lead?: boolean } = {}) {
  const { project, task } = rowTitle(S, t);
  const mark = kind === "needs" ? `<span class="pill">Needs you</span>` : kind === "done" ? `<span class="blue"></span>` : kind === "working" ? I.spin : "";
  return `<div class="sw" data-a="${esc(t.a)}"><div class="swbg"></div><div class="row ${kind === "idle" ? "read" : ""}">${badge(working([t, ...kids]))}
    <div class="rb"><div class="l1"><b>${t.pin ? '<span class="pinmark">●</span>' : ""}${esc(project)}</b>${opt.lead ? '<i class="tag">Lead</i>' : ""}<span>${esc(task)}</span></div>
    <div class="l2">${esc(t.app ?? "shell")} · ${esc(S.core ?? "")}</div></div>
    <div class="end">${mark}<span>${ago(t.changed)}</span></div></div></div>`;
}
function viewInbox() {
  const main = page("inbox", "Inbox");
  let q = sessionStorage.getItem("q") ?? "";
  let mode = settings().inbox;
  main.innerHTML = `<label class="search ${q ? "" : "hide"}" id="sl">${I.search}<input id="q" type="search" placeholder="Jump to a terminal…" autocomplete="off" value="${esc(q)}"></label>
    <div class="seg full" id="mode"><button data-v="leads" class="${mode === "leads" ? "on" : ""}">Leads</button><button data-v="all" class="${mode === "all" ? "on" : ""}">All agents</button></div><div id="rows"></div>`;
  const rows = $("#rows", main)!;
  $("#mode", main)!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null;
    if (!b) return;
    mode = b.dataset.v as "leads" | "all"; save({ inbox: mode });
    main.querySelectorAll("#mode button").forEach((c) => c.classList.toggle("on", c === b));
    draw();
  });
  const draw = () => {
    const items = inbox(S, q, mode);
    const leads = leadSet();
    if (!items.length) { rows.innerHTML = `<div class="empty">${S.up ? (q ? "No match." : "No agents report status yet.") : "Connecting to the server…"}</div>`; return; }
    let html = "", sec = "";
    for (const { t, kind, kids } of items) {
      const s = t.pin ? "Pinned" : KIND_LABEL[kind];
      if (s !== sec) { html += `${sec ? "</div>" : ""}<div class="label">${s}</div><div class="group">`; sec = s; }
      html += mode === "leads" ? rowHtml(t, kind, kids) : rowHtml(t, kind, kids, { lead: leads.has(t.a) });
    }
    rows.innerHTML = html + "</div>";
  };
  draw(); listeners.add(draw);
  $("#q", main)!.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; sessionStorage.setItem("q", q); draw(); });
  // Search hides behind a button to save space; an empty search closes when it loses focus.
  $("#plus")!.insertAdjacentHTML("beforebegin", `<button class="round" id="sb" aria-label="Search">${I.search}</button>`);
  const sl = $("#sl", main)!, qi = $("#q", main) as HTMLInputElement;
  $("#sb")!.onclick = () => {
    if (sl.classList.contains("hide")) { sl.classList.remove("hide"); qi.focus(); return; }
    qi.value = ""; q = ""; sessionStorage.removeItem("q"); sl.classList.add("hide"); draw();
  };
  qi.addEventListener("blur", () => { if (!qi.value) sl.classList.add("hide"); });
  bindRows(rows);
}

/** Tap opens; swipe right toggles read; swipe left sends Esc; hold for actions. */
function bindRows(root: HTMLElement) {
  let sx = 0, sy = 0, dx = 0, w: HTMLElement | null = null, lock: "x" | "y" | null = null, timer = 0, held = false;
  root.addEventListener("touchstart", (e) => {
    w = (e.target as HTMLElement).closest(".sw");
    if (!w) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lock = null; held = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (w && !lock) { held = true; actions(w.dataset.a!); } }, 500);
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!w) return;
    const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
    if (!lock && (Math.abs(x) > 8 || Math.abs(y) > 8)) { lock = Math.abs(x) > Math.abs(y) ? "x" : "y"; clearTimeout(timer); }
    if (lock !== "x") return;
    e.preventDefault();
    dx = Math.max(-130, Math.min(130, x));
    w.classList.add("drag");
    (w.querySelector(".row") as HTMLElement).style.transform = `translateX(${dx}px)`;
    const t = findTerm(w.dataset.a!);
    const bg = w.querySelector(".swbg") as HTMLElement;
    bg.style.background = dx > 0 ? "var(--done)" : "var(--red)";
    bg.innerHTML = dx > 0 ? `<span>${t && kindOf(t) === "done" ? "Read" : "Unread"}</span><span></span>` : `<span></span><span>Esc</span>`;
  }, { passive: false });
  root.addEventListener("touchend", async () => {
    clearTimeout(timer);
    if (!w) return;
    const el = w; w = null;
    el.classList.remove("drag");
    (el.querySelector(".row") as HTMLElement).style.transform = "";
    const t = findTerm(el.dataset.a!);
    if (!t) return;
    if (lock === "x" && dx > 70) await toggleRead(t);
    else if (lock === "x" && dx < -70) post("keys", { terminal: t.a, keys: ["esc"] }).then(() => toast("Esc sent"), (e) => toast(e.message));
    else if (!lock && !held) go(`/t/${t.a}`);
  });
  root.addEventListener("click", (e) => {
    if ("ontouchstart" in window) return;
    const el = (e.target as HTMLElement).closest(".sw") as HTMLElement | null;
    if (el) go(`/t/${el.dataset.a}`);
  });
}
async function toggleRead(t: T) {
  const k = kindOf(t);
  if (k !== "done" && k !== "needs" && t.turn === 0) return toast("Nothing finished yet");
  const seen = k === "done" || k === "needs" ? t.turn : t.turn - 1;
  await post("label", { terminal: t.a, labels: { "herdr.seen": String(seen) } }).catch((e) => toast(e.message));
}
function actions(addr: string) {
  const t = findTerm(addr);
  if (!t) return;
  const { project, task } = rowTitle(S, t);
  const sp = placeOf(S, t).space;
  const { el, close } = sheet(`<h2>${esc(project)} <span style="color:var(--mut);font-weight:500">${esc(task)}</span></h2><div class="group">
    <button class="act" data-x="open">Open</button>
    <button class="act" data-x="pin">${t.pin ? "Unpin" : "Pin"}</button>
    <button class="act" data-x="read">${kindOf(t) === "done" ? "Mark read" : "Mark unread"}</button>
    <button class="act" data-x="continue">Send “continue”</button>
    <button class="act" data-x="esc">Press Esc</button>
    ${sp ? `<button class="act" data-x="space">Go to ${esc(sp.name)}</button>` : ""}</div>
    <div class="group" style="margin-top:12px"><button class="act red" data-x="interrupt">Interrupt</button><button class="act red" data-x="close">Close terminal</button>${sp && ME.features.app ? `<button class="act red" data-x="closespace">Close space ${esc(sp.name)}</button>` : ""}</div>`);
  el.addEventListener("click", async (e) => {
    const x = ((e.target as HTMLElement).closest("[data-x]") as HTMLElement | null)?.dataset.x;
    if (!x) return;
    close();
    try {
      if (x === "open") go(`/t/${t.a}`);
      if (x === "pin") await post("label", { terminal: t.a, labels: { "herdr.pinned": t.pin ? "" : "1" } });
      if (x === "read") await toggleRead(t);
      if (x === "continue") { await post("send", { terminal: t.a, text: "continue" }); toast("Sent"); }
      if (x === "esc") { await post("keys", { terminal: t.a, keys: ["esc"] }); toast("Esc sent"); }
      if (x === "interrupt") { await post("interrupt", { terminal: t.a }); toast("Interrupted"); }
      if (x === "space" && sp) go(`/spaces/${sp.id}`);
      if (x === "close") closeTerminalFlow(t.a);
      if (x === "closespace" && sp) closeSpaceFlow(sp.id);
    } catch (err) { toast((err as Error).message); }
  });
}
function confirmSheet(title: string, body: string, label: string): Promise<boolean> {
  return new Promise((res) => {
    const { el, close } = sheet(`<h2>${esc(title)}</h2><p class="note">${esc(body)}</p><div class="group"><button class="act red" data-ok>${esc(label)}</button></div><div class="group" style="margin-top:12px"><button class="act" data-no>Cancel</button></div>`);
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-ok]")) { close(); res(true); } else if (t.closest("[data-no]")) { close(); res(false); }
    });
  });
}
/** Closing the last terminal of a space closes the space too (the Herdr app does the same). */
async function closeTerminalFlow(addr: string) {
  const t = findTerm(addr);
  if (!t) return;
  const sp = placeOf(S, t).space;
  const last = sp && spaceTerminals(S, sp).length === 1;
  const { project, task } = rowTitle(S, t);
  if (!(await confirmSheet(last ? `Close ${sp!.name}?` : `Close ${task || project}?`, last ? "This is the last terminal of the space. Its program ends and the space closes." : "Its program ends and its pane closes.", last ? "Close terminal and space" : "Close terminal"))) return;
  try {
    const r = await post("close", { terminal: t.a });
    toast(r.closed === "space" ? "Space closed" : "Terminal closed");
    if (route().name === "term") back("/inbox");
  } catch (err) { toast((err as Error).message); }
}
async function closeSpaceFlow(id: string) {
  const sp = S.spaces.find((x) => x.id === id);
  if (!sp) return;
  const n = spaceTerminals(S, sp).length;
  if (!(await confirmSheet(`Close ${sp.name}?`, `${n} terminal${n === 1 ? "" : "s"} end. You can open the space again from the Herdr app.`, "Close space"))) return;
  try { await post("space/close", { id }); toast("Space closed"); if (route().name === "space") go("/spaces", true); }
  catch (err) { toast((err as Error).message); }
}

// ---------- spaces ----------
function viewSpaces() {
  const main = page("spaces", "Spaces");
  const draw = () => {
    const sps = recentSpaces();
    main.innerHTML = sps.length ? `<div class="label">${esc(S.core ?? "")}</div><div class="group">${sps.map((sp) => {
      const c = counts(S, spaceTerminals(S, sp));
      const mark = c.needs ? `<span class="pill">${c.needs}</span>` : c.done ? `<span class="blue"></span>` : c.working ? I.spin : "";
      return `<a class="row" href="/spaces/${esc(sp.id)}">${badge(c.working)}<div class="rb"><div class="l1"><b>${esc(sp.name)}</b><span>${sp.tabs.length} tab${sp.tabs.length === 1 ? "" : "s"}</span></div>
        <div class="l2">${esc(home(sp.folder))}</div></div><div class="end">${mark}<span class="chev">›</span></div></a>`;
    }).join("")}</div>` : `<div class="empty">${S.up ? "No spaces. Spaces come from the Herdr app." : "Connecting to the server…"}</div>`;
  };
  draw(); listeners.add(draw);
}
function mapHtml(n: Node, me = ""): string {
  if (n.t) {
    const t = findTerm(n.t);
    const k = t?.st ? kindOf(t) : "idle";
    const mark = k === "needs" ? `<span class="pill" style="font-size:11px;padding:1px 6px">Needs you</span>` : k === "done" ? `<span class="blue"></span>` : k === "working" ? I.spin.replace('class="spin"', 'class="spin" style="width:14px;height:14px"') : "";
    return `<a class="pane ${k}" href="/t/${esc(n.t)}" style="flex:${n.w ?? 1}${n.t === me ? ";border-color:var(--accent)" : ""}"><b>${esc(t?.app ?? "shell")}${mark}</b><span>${esc(plain(t?.msg) || t?.title || (t ? home(t.cwd) : "ended"))}</span></a>`;
  }
  return `<div class="split ${n.d === "column" ? "column" : ""}" style="flex:${n.w ?? 1}">${(n.c ?? []).map((c) => mapHtml(c, me)).join("")}</div>`;
}
function tabName(n: string) { return /^\d+$/.test(n) ? `Tab ${n}` : n.replace(/^Brief:\s*/, "").replace(/`/g, ""); }
const peeks = new Map<string, string>();
function spaceRowHtml(t: T, lead: boolean) {
  const kind = t.st != null ? kindOf(t) : "idle";
  const { project, task } = rowTitle(S, t);
  const recent = (peeks.get(t.a) || plain(t.msg)).replace(/\s+/g, " ").trim();
  const wt = t.cwd.split("/.worktrees/")[1]?.split("/")[0];
  const branch = t.branch ?? wt ?? "";
  const mark = kind === "needs" ? `<span class="pill">Needs you</span>` : kind === "done" ? `<span class="blue"></span>` : kind === "working" ? I.spin : "";
  return `<div class="sw" data-a="${esc(t.a)}"><div class="swbg"></div><div class="row srow ${kind === "idle" && !lead ? "read" : ""}">
    <div class="rb"><div class="l1"><b>${esc(task || project)}</b>${lead ? '<i class="tag">Lead</i>' : ""}</div>
    ${recent && recent !== task ? `<div class="recent">${esc(recent)}</div>` : ""}
    <div class="l2">${branch ? `${I.branch}${esc(branch)} · ` : ""}${esc(t.app ?? "shell")}</div></div>
    <div class="end">${mark}<span>${kind === "working" ? "" : ago(t.changed)}</span></div></div></div>`;
}
function viewSpace(r: Route) {
  const sp0 = S.spaces.find((s) => s.id === r.arg);
  const main = page("", sp0?.name ?? "Space", sp0 ? home(sp0.folder) : "", "/spaces");
  $(".bar")!.insertAdjacentHTML("beforeend", `<button class="round" id="nw" aria-label="New terminal">${I.plus}</button>`);
  $("#nw")!.onclick = () => newSheet(r.arg);
  meReady.then(() => {
    if (!ME.features.app || !$(".bar")) return;
    $(".bar")!.insertAdjacentHTML("beforeend", `<button class="round danger" id="del" aria-label="Close space">${I.trash}</button>`);
    $("#del")!.onclick = () => closeSpaceFlow(r.arg);
  });
  // Bottom tabs: the terminals of the space, and the reports in its folder.
  let tab = r.q.get("tab") === "reports" ? "reports" : "agents";
  app.insertAdjacentHTML("beforeend", `<nav class="tabs" id="stabs"><button data-t="agents">${I.spaces}Terminals</button><button data-t="reports">${I.reports}Reports</button></nav>`);
  const showTab = () => {
    $("#stabs")!.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
    $("#nw")!.style.visibility = tab === "agents" ? "" : "hidden";
    drawn = "";
    draw();
    if (tab === "reports") { const sp = S.spaces.find((s) => s.id === r.arg); if (sp) spaceReports(sp); }
  };
  $("#stabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-t]") as HTMLElement | null;
    if (!b || b.dataset.t === tab) return;
    tab = b.dataset.t!;
    history.replaceState(history.state, "", `/spaces/${encodeURIComponent(r.arg)}${tab === "reports" ? "?tab=reports" : ""}`);
    $("#pg")!.scrollTop = 0;
    showTab();
  });
  let drawn = "";
  const draw = () => {
    const sp = S.spaces.find((s) => s.id === r.arg);
    if (!sp) { main.innerHTML = `<div class="empty">${S.up ? "This space is closed." : "Connecting…"}</div>`; return; }
    $("#bigt")!.innerHTML = `${esc(sp.name)}<small>${esc(home(sp.folder))} · ${esc(S.core ?? "")}</small>`;
    if (tab === "reports") {
      if (drawn !== "reports") { drawn = "reports"; main.innerHTML = `<div id="sr"><div class="empty">Loading…</div></div>`; }
      return;
    }
    const lead = leadOf(S, sp);
    const rank = (t: T) => ["needs", "done", "working", "idle"].indexOf(t.st != null ? kindOf(t) : "idle");
    const others = spaceTerminals(S, sp).filter((t) => t.a !== lead?.a).sort((a, b) => rank(a) - rank(b) || b.changed - a.changed);
    const html = (lead ? `<div class="group leadcard">${spaceRowHtml(lead, true)}</div>` : `<div class="empty">No terminals.</div>`)
      + (others.length ? `<div class="label">${others.length} more</div><div class="group">${others.map((t) => spaceRowHtml(t, false)).join("")}</div>` : "");
    if (html === drawn) return;
    drawn = html;
    main.innerHTML = html;
  };
  draw(); listeners.add(draw);
  bindRows(main);
  // The newest thing each agent said, read from its screen.
  const peek = async () => {
    const sp = S.spaces.find((s) => s.id === r.arg);
    if (!sp) { if (!closedView) setTimeout(peek, 400); return; }
    if (document.visibilityState !== "visible") return;
    const ts = spaceTerminals(S, sp).map((t) => t.a);
    const got = await fetch(`/api/peek?t=${ts.map(encodeURIComponent).join(",")}`).then((x) => x.json()).catch(() => ({}));
    for (const [a, v] of Object.entries(got)) peeks.set(a, String(v));
    draw();
  };
  let closedView = false;
  peek();
  const timer = setInterval(peek, 8000);
  showTab();
  if (tab === "reports" && !S.spaces.some((s) => s.id === r.arg)) setTimeout(() => { const x = S.spaces.find((s) => s.id === r.arg); if (x) { draw(); spaceReports(x); } }, 800);
  return () => { closedView = true; clearInterval(timer); };
}
async function spaceReports(sp: Space) {
  const data = await reportsData();
  const el = $("#sr");
  if (!el) return;
  const folder = sp.folder.replace(/\/$/, "");
  const roots = new Set(data.roots.filter((r) => r.path === folder || r.path.startsWith(folder + "/")).map((r) => r.id));
  const hits = data.groups.filter((g) => roots.has(rootIdOf(g)));
  el.innerHTML = hits.length ? `<div class="group" style="margin-top:8px">${hits.slice(0, 150).map(groupRow).join("")}</div>` : `<div class="empty">No reports under this folder.</div>`;
}

// ---------- terminal ----------
function phoneSize() {
  const f = settings().font;
  return { cols: Math.max(30, Math.floor((Math.min(innerWidth, 560) - 18) / (f * 0.602))), rows: Math.max(10, Math.floor((innerHeight - 190) / (f * 1.2))) };
}
const DARK = { background: "#1f2026", foreground: "#e6e6ea", cursor: "#e6e6ea", cursorAccent: "#1f2026", selectionBackground: "#3a4a75",
  black: "#2a2b33", red: "#ff7a72", green: "#7bd88f", yellow: "#f0c674", blue: "#8fb2ff", magenta: "#b4a2ff", cyan: "#7dd3e0", white: "#c9c9d1",
  brightBlack: "#6b6c78", brightRed: "#ff9a93", brightGreen: "#9be3a9", brightYellow: "#ffd98e", brightBlue: "#aac4ff", brightMagenta: "#c9bbff", brightCyan: "#9fe2ec", brightWhite: "#ffffff" };
const LIGHT = { background: "#ffffff", foreground: "#1d2127", cursor: "#1d2127", cursorAccent: "#ffffff", selectionBackground: "#cfe0ff",
  black: "#1d2127", red: "#c0262d", green: "#1a7f37", yellow: "#9a6700", blue: "#0b5cd5", magenta: "#8250df", cyan: "#0e7490", white: "#6e7781",
  brightBlack: "#57606a", brightRed: "#d1242f", brightGreen: "#1f883d", brightYellow: "#b35900", brightBlue: "#1f6feb", brightMagenta: "#a475f9", brightCyan: "#0891b2", brightWhite: "#8c959f" };

function viewTerm(r: Route) {
  const key = r.arg;
  const st = settings();
  app.innerHTML = `<div class="term">
    <div class="thead" id="th"><button class="ib" id="bk" aria-label="Inbox">${I.inbox}</button>
      <div class="ttl"><b id="tt">${esc(key)}</b><small id="ts"></small><div class="dots" id="dots"></div></div>
      <button class="ib" id="tm" aria-label="Panes">${I.panes}<span class="cnt" id="pc"></span></button></div>
    <div class="tbody ${st.wide ? "wide" : ""}" id="tb"><div class="thost" id="host"></div><div class="tnote" id="note">Connecting…</div></div>
    <div class="kb">
      <div class="keys"><div class="kpages" id="kp">
        <div class="kpage"><button data-k="esc">esc</button><button data-m="ctrl">ctrl</button><button data-m="alt">alt</button><button data-k="tab">tab</button><button data-k="stab">⇧tab</button><button id="pad" aria-label="Arrows">${I.move}</button><button data-k="ctrl+c">^C</button></div>
        <div class="kpage"><button data-k="up">↑</button><button data-k="down">↓</button><button data-k="left">←</button><button data-k="right">→</button><button data-k="enter">⏎</button><button data-k="/">/</button><button data-k="txt" aria-label="Text">${I.text}</button></div>
      </div><div class="kdots" id="kd"><i class="on"></i><i></i></div></div>
      <button class="rbtn" id="kbd" aria-label="Keyboard">${I.kbd}</button>
      <button class="rbtn" id="cmp" aria-label="Write">${I.pen}</button>
    </div></div>`;
  $("#bk")!.onclick = () => back("/inbox");
  let term: import("./term.ts").Term | null = null;
  let closed = false;
  let lastSeen = -1;

  const panesOf = (t: T) => {
    const { tab } = placeOf(S, t);
    const full = tab && S.spaces.flatMap((s) => s.tabs).find((x) => x.id === tab.id);
    return full ? terminalsIn(full.root) : [t.a];
  };
  const header = () => {
    const t = findTerm(key);
    if (!t) { $("#ts")!.textContent = S.up ? "ended" : "connecting…"; return; }
    const { project, task } = rowTitle(S, t);
    $("#tt")!.textContent = task || project;
    $("#ts")!.textContent = [task ? project : t.app, S.core].filter(Boolean).join(" · ");
    const panes = panesOf(t);
    $("#dots")!.innerHTML = panes.length > 1 ? panes.map((a) => `<i class="${a === t.a ? "on" : ""}"></i>`).join("") : "";
    const sp = placeOf(S, t).space;
    const n = sp ? spaceTerminals(S, sp).length : 1;
    $("#pc")!.textContent = n > 1 ? String(n) : "";
    if (document.visibilityState === "visible" && t.st != null && t.turn > (t.seen ?? -1) && lastSeen !== t.turn) {
      lastSeen = t.turn;
      post("label", { terminal: t.a, labels: { "herdr.seen": String(t.turn) } }).catch(() => {});
    }
  };
  header(); listeners.add(header);
  const onVis = () => { header(); term?.focusStream(document.visibilityState === "visible"); };
  document.addEventListener("visibilitychange", onVis);

  // swipe the header for the next pane in this tab
  let hx = 0;
  const th = $("#th")!;
  th.addEventListener("touchstart", (e) => { hx = e.touches[0].clientX; }, { passive: true });
  th.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - hx;
    const t = findTerm(key);
    if (!t || Math.abs(dx) < 60) return;
    const panes = panesOf(t), i = panes.indexOf(t.a);
    const next = panes[(i + (dx < 0 ? 1 : -1) + panes.length) % panes.length];
    if (next && next !== t.a) go(`/t/${next}`, true);
  });
  $("#tm")!.onclick = () => {
    const t = findTerm(key);
    const sp = t && placeOf(S, t).space;
    const { el, close } = sheet(`${sp ? `<h2>${esc(sp.name)}</h2>${sp.tabs.map((tab) => `<div class="tabcard"><h3>${esc(tabName(tab.name))}</h3><div class="map">${mapHtml(tab.root, t!.a)}</div></div>`).join("")}` : `<h2>${esc(key)}</h2>`}
      <div class="group"><button class="act" data-x="wide">${settings().wide ? "Fit to phone width" : "Keep desktop size"}</button>${t ? `<button class="act" data-x="pin">${t.pin ? "Unpin" : "Pin"}</button><button class="act" data-x="unread">Mark unread</button>` : ""}${sp ? `<button class="act" data-x="space">Open space</button>` : ""}<button class="act red" data-x="interrupt">Interrupt</button>${t ? `<button class="act red" data-x="close">Close terminal</button>` : ""}</div>`);
    el.addEventListener("click", async (e) => {
      if ((e.target as HTMLElement).closest("a")) { close(); return; }
      const x = ((e.target as HTMLElement).closest("[data-x]") as HTMLElement | null)?.dataset.x;
      if (!x) return;
      close();
      try {
        if (x === "wide") { save({ wide: !settings().wide }); current = ""; render(); }
        if (x === "pin" && t) await post("label", { terminal: t.a, labels: { "herdr.pinned": t.pin ? "" : "1" } });
        if (x === "unread" && t && t.turn > 0) { lastSeen = t.turn; await post("label", { terminal: t.a, labels: { "herdr.seen": String(t.turn - 1) } }); toast("Marked unread"); }
        if (x === "space" && sp) go(`/spaces/${sp.id}`);
        if (x === "interrupt") { await post("interrupt", { terminal: t?.a ?? key }); toast("Interrupted"); }
        if (x === "close" && t) closeTerminalFlow(t.a);
      } catch (err) { toast((err as Error).message); }
    });
  };

  Promise.all([import("./term.ts"), meReady]).then(([{ openTerm }]) => {
    if (closed) return;
    const t = findTerm(key);
    term = openTerm($("#host")!, $("#tb")!, t?.a ?? key, {
      links: linkPattern(ME),
      wide: st.wide, cols: t?.cols ?? 100, rows: t?.rows ?? 40, fontSize: st.font, theme: themeName() === "dark" ? DARK : LIGHT,
      onKeyboard: (open) => $("#kbd")?.classList.toggle("on", open), onNote: (s) => { const n = $("#note"); if (n) { n.textContent = s; n.style.display = s ? "" : "none"; } }, onLink: openLink,
    });
  });

  // key bar: its buttons never take focus, so the keyboard stays open while you press esc, tab or arrows
  $(".kb")!.addEventListener("mousedown", (e) => { if ((e.target as Element).closest("button")) e.preventDefault(); });
  const kp = $("#kp")!;
  kp.addEventListener("scroll", () => { const i = Math.round(kp.scrollLeft / kp.clientWidth); $("#kd")!.innerHTML = `<i class="${i === 0 ? "on" : ""}"></i><i class="${i === 1 ? "on" : ""}"></i>`; }, { passive: true });
  kp.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b || !term || b.id === "pad") return;
    if (b.dataset.m) {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      term.setMod(b.dataset.m as "ctrl" | "alt", on, () => b.classList.remove("on"));
      return;
    }
    if (b.dataset.k === "txt") return void textView(findTerm(key)?.a ?? key);
    term.key(b.dataset.k!);
  });
  // ✥: drag to press arrows
  const pad = $("#pad")!;
  let px = 0, py = 0;
  pad.addEventListener("touchstart", (e) => { px = e.touches[0].clientX; py = e.touches[0].clientY; }, { passive: true });
  pad.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const x = e.touches[0].clientX, y = e.touches[0].clientY, step = 22;
    while (x - px > step) { term?.key("right"); px += step; }
    while (px - x > step) { term?.key("left"); px -= step; }
    while (y - py > step) { term?.key("down"); py += step; }
    while (py - y > step) { term?.key("up"); py -= step; }
  }, { passive: false });
  $("#kbd")!.onclick = () => { const on = term?.toggleKeyboard() ?? false; $("#kbd")!.classList.toggle("on", on); };
  $("#cmp")!.onclick = () => compose(findTerm(key)?.a ?? key, (text) => term?.paste(text, true));
  return () => { closed = true; stopMic(); term?.dispose(); document.removeEventListener("visibilitychange", onVis); };
}

function openLink(text: string) {
  const h = homeLink(text, ME);
  if (h) return go(`/view?r=h&p=${encodeURIComponent(h)}`);
  if (/^https?:\/\//.test(text)) window.open(text, "_blank", "noopener");
}
async function textView(addr: string) {
  const wrap = $("#tb");
  if (!wrap) return;
  const old = $(".textview", wrap);
  if (old) return old.remove();
  const div = document.createElement("div");
  div.className = "textview"; div.textContent = "Loading…";
  wrap.append(div);
  const r = await fetch(`/api/read?t=${encodeURIComponent(addr)}&lines=1500`).then((x) => x.json()).catch(() => null);
  const text: string = (r?.text ?? r?.screen ?? JSON.stringify(r ?? {}, null, 1)).replace(/\s+$/, "");
  div.innerHTML = esc(text).replace(linkPattern(ME), (m) => `<a data-link="${m}">${m}</a>`);
  div.onclick = (e) => { const a = (e.target as HTMLElement).closest("[data-link]") as HTMLElement | null; if (a) openLink(a.dataset.link!.replace(/&amp;/g, "&")); };
  div.scrollTop = div.scrollHeight;
}

function compose(addr: string, paste: (text: string) => void, initial = "") {
  const dk = `draft:${addr}`;
  const files: { name: string; data: string; url: string }[] = [];
  const draft = [localStorage.getItem(dk) ?? "", initial].filter(Boolean).join(" ");
  const { el, close } = sheet(`<div class="compose"><textarea id="ta" placeholder="Message" enterkeyhint="send">${esc(draft)}</textarea>
    <div class="thumbs" id="th"></div>
    <div class="crow">${ME.features.dictate ? `<button class="rbtn sm" id="cmic" aria-label="Dictate">${I.mic}</button>` : ""}<label class="btn ghost">Photo<input id="file" type="file" accept="image/*" multiple hidden></label><span class="grow"></span><button class="btn" id="send">Send</button></div></div>`);
  const ta = $("#ta", el) as HTMLTextAreaElement;
  if (initial) localStorage.setItem(dk, draft);
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
  ta.oninput = () => localStorage.setItem(dk, ta.value);
  if ($("#cmic", el)) $("#cmic", el)!.onclick = () => mic($("#cmic", el)!, (text) => { ta.value = [ta.value.trim(), text].filter(Boolean).join(" "); localStorage.setItem(dk, ta.value); });
  ($("#file", el) as HTMLInputElement).onchange = async (e) => {
    for (const f of Array.from((e.target as HTMLInputElement).files ?? [])) files.push({ name: f.name.replace(/\.(heic|heif)$/i, ".jpg") || "photo.jpg", data: await shrink(f), url: URL.createObjectURL(f) });
    $("#th", el)!.innerHTML = files.map((f) => `<img src="${f.url}">`).join("");
  };
  $("#send", el)!.onclick = async () => {
    const btn = $("#send", el) as HTMLButtonElement;
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const paths: string[] = [];
      for (const f of files) paths.push((await post("put", { terminal: addr, name: f.name, data: f.data })).path);
      const full = [ta.value.trim(), ...paths].filter(Boolean).join(" ");
      if (full) paste(full);
      localStorage.removeItem(dk);
      close();
    } catch (err) { toast((err as Error).message); btn.disabled = false; btn.textContent = "Send"; }
  };
}

// ---------- dictation: record on the phone, transcribe on the server with the model selected in Hex ----------
let rec: { mr: MediaRecorder; stream: MediaStream; btn: HTMLElement } | null = null;
function stopMic() { if (rec) { rec.mr.onstop = null; rec.mr.stop(); rec.stream.getTracks().forEach((t) => t.stop()); rec.btn.classList.remove("rec"); rec = null; } }
let micStarting = false, micCancel = false;
async function mic(btn: HTMLElement, onText: (text: string) => void) {
  if (rec) { if (rec.mr.state === "recording") rec.mr.stop(); return; }
  if (micStarting) { micCancel = true; btn.classList.remove("rec"); return; } // tapped again before the mic was ready
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return toast("This browser cannot record audio");
  let stream: MediaStream;
  micStarting = true; micCancel = false;
  btn.classList.add("rec");
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { micStarting = false; btn.classList.remove("rec"); return toast("Microphone access was refused"); }
  micStarting = false;
  if (micCancel || !btn.isConnected) { stream.getTracks().forEach((t) => t.stop()); btn.classList.remove("rec"); return; }
  const mr = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    rec = null;
    delete btn.dataset.state;
    btn.classList.remove("rec"); btn.classList.add("busy");
    try {
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/mp4" });
      const r = await fetch("/api/dictate", { method: "POST", headers: { "x-hm": "1", "content-type": blob.type }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (j.text) onText(j.text); else toast("No speech heard");
    } catch (err) { toast((err as Error).message); }
    btn.classList.remove("busy");
  };
  mr.start();
  rec = { mr, stream, btn };
  btn.dataset.state = "recording";
}
async function shrink(f: File): Promise<string> {
  const b64 = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(b); });
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.size < 1.5e6 && /png|jpe?g/.test(f.type)) return b64(f);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return b64(await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85)));
  } catch { return b64(f); }
}

// ---------- reports ----------
type GroupRow = { k: string; n: string; r: string; m: number; main: { p: string; k: string; t?: string } | null; d: number; i: number };
type ReportsData = { scannedAt: number; roots: { id: string; label: string; path: string }[]; groups: GroupRow[] };
let rcache: { at: number; data: ReportsData } | null = null;
async function reportsData(fresh = false): Promise<ReportsData> {
  if (!fresh && rcache && Date.now() - rcache.at < 30_000) return rcache.data;
  const data = await fetch(`/api/reports${fresh ? "?fresh=1" : ""}`).then((r) => r.json());
  rcache = { at: Date.now(), data };
  return data;
}
const pins = () => new Set<string>(JSON.parse(localStorage.getItem("report.pins") ?? "[]"));
const rootIdOf = (g: { k: string }) => g.k.slice(0, g.k.indexOf(":"));
const viewHref = (root: string, p: string, t?: string) => `/view?r=${encodeURIComponent(root)}&p=${encodeURIComponent(p)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
function groupRow(g: GroupRow) {
  const kind = g.main?.k ?? "img";
  const title = g.main?.t && g.main.t !== g.n ? g.main.t : "";
  const href = g.main ? viewHref(rootIdOf(g), g.main.p, g.main.t) : `/reports/g?k=${encodeURIComponent(g.k)}`;
  const n = g.d + g.i;
  return `<div class="row"><span class="kind ${kind}">${kind.toUpperCase()}</span>
    <a class="rb" href="${href}"><div class="l1"><b>${pins().has(g.k) ? '<span class="pinmark">●</span>' : ""}${esc(title || g.n)}</b></div>
    <div class="l2">${title ? `${esc(g.n)} · ` : ""}${esc(g.r)} · ${ago(g.m)}</div></a>
    ${n > 1 ? `<a class="more" href="/reports/g?k=${encodeURIComponent(g.k)}">${n} ›</a>` : ""}</div>`;
}
function viewReports(r: Route) {
  const main = page("reports", "Reports");
  let q = r.q.get("q") ?? "", since = r.q.get("since") ?? "all";
  const SINCE: Record<string, [string, number]> = { "2h": ["2 hours", 2 * 3600e3], "24h": ["24 hours", 86400e3], all: ["All", Infinity] };
  main.innerHTML = `<label class="search">${I.search}<input id="q" type="search" placeholder="Search reports" autocomplete="off" value="${esc(q)}"></label>
    <div class="seg full" id="since">${Object.entries(SINCE).map(([k, [l]]) => `<button data-v="${k}" class="${k === since ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="list"><div class="empty">Loading…</div></div>`;
  const list = $("#list", main)!;
  let data: ReportsData | null = null;
  const sync = () => history.replaceState(history.state, "", `/reports${q || since !== "all" ? "?" : ""}${new URLSearchParams({ ...(q ? { q } : {}), ...(since !== "all" ? { since } : {}) })}`);
  const draw = () => {
    if (!data) return;
    const ql = q.toLowerCase(), pinned = pins(), after = Date.now() - (SINCE[since] ?? SINCE.all)[1];
    const rows = data.groups.filter((g) => g.m >= after && (!ql || `${g.n} ${g.main?.t ?? ""} ${g.main?.p ?? ""} ${g.r}`.toLowerCase().includes(ql)))
      .sort((a, b) => Number(pinned.has(b.k)) - Number(pinned.has(a.k)) || b.m - a.m);
    const shown = rows.slice(0, 150);
    list.innerHTML = (shown.length ? `<div class="group" style="margin-top:12px">${shown.map(groupRow).join("")}</div>${rows.length > 150 ? `<div class="empty">Newest 150 shown. Search to narrow.</div>` : ""}` : `<div class="empty">No reports match.</div>`);
  };
  reportsData().then((d) => { data = d; draw(); });
  pullToRefresh($("#pg")!, async () => { data = await reportsData(true); draw(); });
  $("#q", main)!.addEventListener("input", (e) => { q = (e.target as HTMLInputElement).value; sync(); draw(); });
  $("#since", main)!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null; if (!b) return; since = b.dataset.v!; main.querySelectorAll("#since button").forEach((c) => c.classList.toggle("on", c === b)); sync(); draw(); });
}
/** Pull down at the top of a page to refresh. */
function pullToRefresh(scroller: HTMLElement, refresh: () => Promise<void>) {
  const ind = document.createElement("div");
  ind.className = "ptr"; ind.innerHTML = I.spin;
  scroller.prepend(ind);
  let y0 = -1, dy = 0, busy = false;
  scroller.addEventListener("touchstart", (e) => { y0 = scroller.scrollTop <= 0 && !busy ? e.touches[0].clientY : -1; dy = 0; }, { passive: true });
  scroller.addEventListener("touchmove", (e) => {
    if (y0 < 0) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    ind.style.height = `${Math.min(70, dy * 0.5)}px`;
    ind.classList.toggle("ready", dy > 120);
  }, { passive: true });
  scroller.addEventListener("touchend", async () => {
    if (y0 < 0) return;
    y0 = -1;
    if (dy <= 120) { ind.style.height = "0"; return; }
    busy = true; ind.style.height = "44px"; ind.classList.add("busy");
    try { await refresh(); toast("Reports updated"); } catch { toast("Could not refresh"); }
    busy = false; ind.style.height = "0"; ind.classList.remove("busy", "ready");
  });
}
function viewGroup(r: Route) {
  const key = r.arg;
  const main = page("", "Report", "", "/reports");
  $(".bar")!.insertAdjacentHTML("beforeend", `<button class="round" id="pin" aria-label="Pin" style="font-size:20px"></button>`);
  const pb = $("#pin")!;
  const show = () => (pb.textContent = pins().has(key) ? "★" : "☆");
  show();
  pb.onclick = () => { const p = pins(); p.has(key) ? p.delete(key) : p.add(key); localStorage.setItem("report.pins", JSON.stringify([...p])); show(); };
  main.innerHTML = `<div class="empty">Loading…</div>`;
  fetch(`/api/reports/group?k=${encodeURIComponent(key)}`).then((x) => x.json()).then((g) => {
    if (g.error) { main.innerHTML = `<div class="empty">Not found.</div>`; return; }
    const root = rootIdOf(g);
    $("#bigt")!.innerHTML = `${esc(g.n)}<small>${esc(g.r)} · ${ago(g.m)}</small>`;
    const docs = g.docs.map((d: any) => `<a class="row" href="${viewHref(root, d.p, d.t)}"><span class="kind ${d.k}">${d.k.toUpperCase()}</span><div class="rb"><div class="l1"><b>${esc(d.t ?? d.p.split("/").pop())}</b></div><div class="l2">${esc(d.p)} · ${size(d.s)} · ${ago(d.m)}</div></div></a>`).join("");
    const imgs = g.images.map((i: any) => `<a href="${viewHref(root, i.p)}"><img loading="lazy" decoding="async" src="/f/${root}/${i.p.split("/").map(encodeURIComponent).join("/")}" alt=""></a>`).join("");
    main.innerHTML = (docs ? `<div class="label">${g.docs.length} documents</div><div class="group">${docs}</div>` : "") + (imgs ? `<div class="label">${g.i} images${g.i > g.images.length ? `, newest ${g.images.length}` : ""}</div><div class="grid">${imgs}</div>` : "");
  });
}
const size = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
function viewFile(r: Route) {
  const root = r.q.get("r") ?? "", p = r.q.get("p") ?? "";
  const ext = (p.split(".").pop() ?? "").toLowerCase();
  const src = `/f/${encodeURIComponent(root)}/${p.split("/").map(encodeURIComponent).join("/")}${ext === "md" ? `?theme=${themeName()}` : ""}`;
  const name = p.split("/").pop() ?? p;
  if (ext === "pdf") { location.href = src; return; }
  app.innerHTML = `<div class="view"><div class="thead"><button class="ib" id="bk" aria-label="Back">${I.back}</button>
    <div class="ttl"><b>${esc(r.q.get("t") || name)}</b><small>${esc(p.split("/").slice(0, -1).join("/") || name)}</small></div>
    <a class="ib" href="${src}" target="_blank" rel="noopener" aria-label="Open alone">${I.open}</a></div><div class="vb" id="vb"><div class="progress"></div></div></div>`;
  $("#bk")!.onclick = () => back("/reports");
  const vb = $("#vb")!;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
    vb.insertAdjacentHTML("beforeend", `<div class="imgview"><img src="${src}" alt=""></div>`);
    $("img", vb)!.addEventListener("load", () => $(".progress", vb)?.remove());
  } else {
    const f = document.createElement("iframe");
    f.src = src;
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads");
    f.onload = () => $(".progress", vb)?.remove();
    vb.append(f);
  }
}

// ---------- settings ----------
function viewSettings() {
  const main = page("", "Settings", "", "/inbox");
  const draw = async () => {
    const s = settings();
    const me = await fetch("/api/me").then((x) => x.json()).catch(() => ({}));
    const seg = (key: string, opts: [string, string][], val: string) => `<div class="seg" data-set="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === val ? "on" : ""}">${l}</button>`).join("")}</div>`;
    main.innerHTML = `
      <div class="label">Appearance</div><div class="group">
        <div class="set"><span class="grow">Theme</span>${seg("theme", [["dark", "Dark"], ["light", "Light"], ["system", "Auto"]], s.theme)}</div></div>
      <div class="label">Terminal</div><div class="group">
        <div class="set"><span class="grow">Text size</span><div class="step"><button data-font="-1">−</button><span class="val" style="width:34px;text-align:center">${s.font}</span><button data-font="1">+</button></div></div>
        <div class="set"><span class="grow">Width<small>Fit sets the terminal to the phone width. Desktop keeps the desktop size and scrolls sideways.</small></span>${seg("wide", [["0", "Fit"], ["1", "Desktop"]], s.wide ? "1" : "0")}</div></div>
      <div class="label">Alerts</div><div class="group">
        <div class="set"><span class="grow">Banner when an agent needs you or is done</span><button class="toggle ${s.banners ? "on" : ""}" data-toggle="banners" aria-label="Banners"></button></div></div>
      <div class="label">Inbox</div><div class="group">
        <div class="set"><span class="grow">Show<small>Leads shows one row for each space. All shows every agent.</small></span>${seg("inbox", [["leads", "Leads"], ["all", "All"]], s.inbox)}</div></div>
      <div class="label">Reports</div><div class="group">
        <div class="set"><span class="grow">Report folders</span><span class="val" id="rc">…</span></div>
        <button class="act" id="rescan" style="color:var(--accent)">Rescan now</button></div>
      <div class="label">Connection</div><div class="group">
        <div class="set"><span class="grow">Machine</span><span class="val">${esc(me.core ?? "—")} · ${me.up ? "connected" : "offline"}</span></div>
        <div class="set"><span class="grow">This device</span><span class="val">${esc(me.device ?? "")}</span></div>
        <div class="set"><span class="grow">Access</span><span class="val">Your Tailscale devices only</span></div>
        <div class="set"><span class="grow">Dictation</span><span class="val">${ME.features.dictate ? "Hex on the server" : "Off (needs hex and ffmpeg)"}</span></div></div>`;
    reportsData().then((d) => { const el = $("#rc"); if (el) el.textContent = `${d.roots.length} folders · ${d.groups.length} reports`; });
  };
  draw();
  main.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const sb = t.closest(".seg button") as HTMLElement | null;
    if (sb) {
      const k = (sb.parentElement as HTMLElement).dataset.set!;
      save(k === "wide" ? { wide: sb.dataset.v === "1" } : ({ [k]: sb.dataset.v } as Partial<Settings>));
      return draw();
    }
    const f = t.closest("[data-font]") as HTMLElement | null;
    if (f) { save({ font: Math.max(10, Math.min(18, settings().font + Number(f.dataset.font))) }); return draw(); }
    if (t.closest("[data-toggle]")) { save({ banners: !settings().banners }); return draw(); }
    if (t.closest("#rescan")) { toast("Scanning…"); await reportsData(true); toast("Done"); draw(); }
  });
}

// ---------- boot ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
connect();
render();
(window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500)))(() => { import("./term.ts"); });
