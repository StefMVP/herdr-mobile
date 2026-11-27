// Pure view-model helpers (unit-tested).
export type T = {
  a: string; name: string | null; title: string; cwd: string; live: boolean;
  st: string | null; msg: string | null; app: string | null; turn: number; seen: number | null; pin: boolean;
  space: string | null; tab: string | null; role: string | null; parent: string | null; lead?: boolean; branch?: string | null;
  cols: number; rows: number; created: number; changed: number;
};
export type Node = { d?: "row" | "column"; c?: Node[]; t?: string; w?: number };
export type Space = { id: string; name: string; folder: string; tabs: { id: string; name: string; root: Node }[] };
export type State = { up: boolean; core: string | null; at: number; spaces: Space[]; terminals: T[] };
export type Kind = "needs" | "done" | "working" | "idle";

/** Herdr status labels: blocked or error need you; working; else done when turn > seen. */
export function kindOf(t: T): Kind {
  if (t.st === "blocked" || t.st === "error") return "needs";
  if (t.st === "working") return "working";
  if (t.seen == null) return t.st === "done" ? "done" : "idle";
  return t.turn > t.seen ? "done" : "idle";
}

export function isAgent(t: T) { return t.st != null; }

export function terminalsIn(n: Node, out: string[] = []): string[] {
  if (n.t) out.push(n.t);
  for (const c of n.c ?? []) terminalsIn(c, out);
  return out;
}

/** Where a terminal sits: its space and tab, by label first, then by layout. */
export function placeOf(s: State, t: T): { space?: Space; tab?: { id: string; name: string } } {
  for (const sp of s.spaces) {
    for (const tab of sp.tabs) if (terminalsIn(tab.root).includes(t.a)) return { space: sp, tab };
  }
  const space = s.spaces.find((x) => x.id === t.space);
  return { space, tab: space?.tabs.find((x) => x.id === t.tab) };
}

export function labelOf(s: State, t: T): string {
  const { space, tab } = placeOf(s, t);
  const tabName = tab && !/^\d+$/.test(tab.name) ? tab.name.replace(/^Brief:\s*/, "").replace(/`/g, "") : "";
  if (space) return tabName ? `${space.name} · ${tabName}` : space.name;
  return t.name ?? t.title ?? t.cwd.split("/").pop() ?? t.a;
}

export type Row = { t: T; kind: Kind; kids: T[] };
const URGENT: Kind[] = ["needs", "done", "working", "idle"];

/** The main terminal of a space: a lead by label, else the first pane of the first tab, else the oldest. */
export function leadOf(s: State, sp: Space): T | undefined {
  const members = spaceTerminals(s, sp);
  const byAddr = new Map(members.map((t) => [t.a, t]));
  return members.find((t) => t.lead)
    ?? sp.tabs.flatMap((tab) => terminalsIn(tab.root)).map((a) => byAddr.get(a)).find((t) => t && isAgent(t))
    ?? [...members].sort((a, b) => a.created - b.created)[0];
}

/**
 * Inbox rows. "all": every top-level agent; helpers fold into their parent.
 * "leads": one row per space (its lead), and the other agents of the space count as its helpers.
 * A row takes the most urgent kind of its group.
 */
export function inbox(s: State, q = "", mode: "all" | "leads" = "all"): Row[] {
  const agents = s.terminals.filter(isAgent);
  const ql = q.trim().toLowerCase();
  const match = (t: T) => !ql || [labelOf(s, t), t.msg, t.app, t.cwd, t.a, t.title, t.name, t.branch].some((x) => x?.toLowerCase().includes(ql));
  const byAddr = new Map(agents.map((t) => [t.a, t]));
  const parentOf = (t: T) => { const p = t.parent?.split("/").pop(); return p && byAddr.has(p) && p !== t.a ? p : null; };
  const groups: { t: T; kids: T[] }[] = [];
  const taken = new Set<string>();
  if (mode === "leads") {
    for (const sp of s.spaces) {
      const lead = leadOf(s, sp);
      const members = spaceTerminals(s, sp).filter(isAgent);
      if (!lead || !members.length) continue;
      const head = isAgent(lead) ? lead : members[0];
      const kids = members.filter((t) => t.a !== head.a);
      groups.push({ t: head, kids });
      for (const t of members) taken.add(t.a);
    }
  }
  for (const t of agents) {
    if (taken.has(t.a) || parentOf(t)) continue;
    groups.push({ t, kids: agents.filter((k) => parentOf(k) === t.a && !taken.has(k.a)) });
  }
  if (mode === "leads") for (const g of groups) {
    // helpers of members also count for the lead
    const inGroup = new Set([g.t.a, ...g.kids.map((k) => k.a)]);
    for (const t of agents) if (!inGroup.has(t.a) && parentOf(t) && inGroup.has(parentOf(t)!) && !taken.has(t.a)) { g.kids.push(t); inGroup.add(t.a); }
  }
  const rows: Row[] = [];
  for (const { t, kids } of groups) {
    if (!match(t) && !kids.some(match)) continue;
    rows.push({ t, kind: URGENT.find((k) => [t, ...kids].some((x) => kindOf(x) === k))!, kids });
  }
  const rank = (r: Row) => URGENT.indexOf(r.kind);
  return rows.sort((a, b) => Number(b.t.pin) - Number(a.t.pin) || rank(a) - rank(b) || b.t.changed - a.t.changed);
}

/** Two-part row title like the Herdr app: project (space or repo) and what it is doing. */
export function rowTitle(s: State, t: T): { project: string; task: string } {
  const { space, tab } = placeOf(s, t);
  const parts = t.cwd.split("/");
  const wt = parts.indexOf(".worktrees");
  const project = space?.name ?? (wt > 0 ? parts[wt - 1] : parts.pop() || t.a);
  const tabName = tab && !/^\d+$/.test(tab.name) ? tab.name.replace(/^Brief:\s*/, "").replace(/`/g, "") : "";
  const title = t.title && !/^\S+@\S+:/.test(t.title) && t.title.toLowerCase() !== (t.app ?? "").toLowerCase() ? t.title : "";
  const msg = (t.msg ?? "").replace(/\*\*|__|`/g, "").split(/(?<=[.!?])\s/)[0];
  return { project, task: tabName || title || (wt > 0 ? parts[wt + 1] ?? "" : "") || msg };
}

export function counts(s: State, ts = s.terminals) {
  const c: Record<Kind, number> = { needs: 0, done: 0, working: 0, idle: 0 };
  for (const t of ts) if (isAgent(t)) c[kindOf(t)]++;
  return c;
}

export function spaceTerminals(s: State, sp: Space): T[] {
  const inLayout = new Set(sp.tabs.flatMap((tab) => terminalsIn(tab.root)));
  return s.terminals.filter((t) => inLayout.has(t.a) || t.space === sp.id);
}

export function ago(ms: number, now = Date.now()): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export type Me = { home: string | null; links: string[] };

/** Links an agent prints: home paths and the configured URL prefixes, as a path below home. */
export function homeLink(text: string, me: Me): string | null {
  if (!me.home) return null;
  const starts = [`file://${me.home}/`, `${me.home}/`, "~/", ...me.links];
  const m = text.match(new RegExp(`^(?:${starts.map(reEsc).join("|")})([^\\s"'<>)]+)$`));
  return m ? m[1] : null;
}

/** Finds links in terminal text: URLs, and files below home with a type the viewer opens. */
export function linkPattern(me: Me): RegExp {
  const files = me.home ? `|(?:file://)?${reEsc(me.home)}/[^\\s"'<>]+\\.(?:html?|md|png|jpe?g|pdf|webp|gif|svg)` : "";
  return new RegExp(`(https?://[^\\s"'<>]+${files})`, "g");
}

/** A route may name a terminal by address or by name; state may arrive after the view opens. */
export function findTerm(s: State, key: string): T | undefined {
  return s.terminals.find((x) => x.a === key || x.name === key);
}
