import type { Core, Terminal } from "./core.ts";
import { branchOf } from "./app.ts";

export type SlimTerminal = {
  a: string; name: string | null; title: string; cwd: string; live: boolean;
  st: string | null; msg: string | null; app: string | null; turn: number; seen: number | null; pin: boolean;
  space: string | null; tab: string | null; role: string | null; parent: string | null; lead: boolean; branch: string | null;
  cols: number; rows: number; created: number; changed: number;
};

export function slimTerminal(t: Terminal): SlimTerminal {
  const l = t.labels ?? {};
  const seen = l["herdr.seen"] != null && /^\d+$/.test(l["herdr.seen"]) ? Number(l["herdr.seen"]) : null;
  return {
    a: t.address, name: t.name ?? null, title: t.title ?? "", cwd: t.cwd ?? "", live: t.state === "live",
    st: t.status?.state ?? null, msg: t.status?.msg ?? null, app: t.status?.app ?? t.foreground?.name ?? null,
    turn: t.turn ?? 0, seen, pin: !!l["herdr.pinned"],
    space: l["herdr.space"] || null, tab: l["herdr.tab"] || null, role: l["herdr.role"] ?? null, parent: t.parent ?? null,
    lead: l["herdr.role"] === "coordinator" || l["herdr.role"] === "lead" || !!l["herdr.lead.space"], branch: branchOf(t.cwd ?? ""),
    cols: t.cols ?? 80, rows: t.rows ?? 24, created: t.created_ms ?? 0, changed: t.status_ms ?? t.created_ms ?? 0,
  };
}

type Node = { type: string; children?: Node[]; content?: { terminal?: string }; size?: any };
export type SlimNode = { d?: "row" | "column"; c?: SlimNode[]; t?: string; w?: number };

function slimNode(n: Node): SlimNode {
  const w = typeof n.size?.fr === "number" ? n.size.fr : typeof n.size?.pct === "number" ? n.size.pct / 100 : undefined;
  if (n.type === "block") return { t: n.content?.terminal, ...(w ? { w } : {}) };
  return { d: n.type === "column" ? "column" : "row", c: (n.children ?? []).map(slimNode), ...(w ? { w } : {}) };
}

export function slimState(core: Core) {
  const spaces = (core.doc?.spaces ?? []).map((s: any) => ({
    id: s.id, name: s.name || s.folder?.split("/").pop() || "space", folder: s.folder ?? "",
    tabs: (s.tabs ?? []).map((t: any, i: number) => ({ id: t.id, name: t.name || String(i + 1), root: slimNode(t.root ?? { type: "row" }) })),
  }));
  const terminals = [...core.terminals.values()].filter((t) => t.state === "live").map(slimTerminal);
  return { up: core.up, core: core.hello?.core?.name ?? null, at: Date.now(), spaces, terminals };
}
