// Report index: HTML, Markdown, PDF and image files under the report roots,
// grouped by their first folder below the root, newest first.
import { readdir, stat, realpath, open } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";

export type Root = { id: string; label: string; path: string };
export type FileEntry = { p: string; kind: Kind; size: number; mtime: number; title?: string };
export type Kind = "html" | "md" | "pdf" | "img" | "txt";
export type Group = { key: string; root: string; dir: string; name: string; mtime: number; main: FileEntry | null; docs: FileEntry[]; images: FileEntry[]; imageCount: number };

const KINDS: Record<string, Kind> = {
  ".html": "html", ".htm": "html", ".md": "md", ".markdown": "md", ".pdf": "pdf",
  ".png": "img", ".jpg": "img", ".jpeg": "img", ".gif": "img", ".webp": "img", ".svg": "img", ".avif": "img",
};
const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "target", ".next", ".cache", ".pytest_cache", ".mypy_cache", "site-packages", ".worktrees", "vendor"]);
const MAX_FILES = 60_000;
const IMAGES_PER_GROUP = 120;

// HM_REPORT_ROOTS: folders separated by ":". "~" is the home folder, and a "*" segment
// matches every folder at that level (for example "~/code/*/reports").
// Without it, ~/reports is the only root.
export function rootsFromEnv(env = process.env, home = homedir()): Root[] {
  const specs = (env.HM_REPORT_ROOTS ?? "~/reports").split(":").map((x) => x.trim()).filter(Boolean);
  const paths: string[] = [];
  const expand = (parts: string[], at: string) => {
    if (!parts.length) { if (existsSync(at) && !paths.includes(at)) paths.push(at); return; }
    const [first, ...rest] = parts;
    if (first !== "*") return expand(rest, join(at, first));
    let names: string[] = [];
    try { names = readdirSync(at, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort(); } catch {}
    for (const n of names) expand(rest, join(at, n));
  };
  for (const spec of specs) {
    const abs = spec === "~" ? home : spec.startsWith("~/") ? join(home, spec.slice(2)) : spec;
    expand(abs.split("/").filter(Boolean), "/");
  }
  return labelRoots(paths, home);
}

/** Short labels: the folder that holds "reports" (or the folder itself), relative to the
 *  deepest folder that all roots in home share, so the list reads "app-a", "tools/app-b".
 *  A root outside home is labeled by its last folder. */
export function labelRoots(paths: string[], home = homedir()): Root[] {
  const inHome = (p: string) => p.startsWith(home + "/");
  const parts = paths.map((p) => (inHome(p) ? p.slice(home.length + 1) : p).replace(/\/reports$/, "").split("/").filter(Boolean));
  const homed = parts.filter((_, i) => inHome(paths[i]));
  let common = 0;
  while (homed.length > 1 && homed.every((x) => x.length > common + 1 && x[common] === homed[0][common])) common++;
  return paths.map((path, i) => ({ id: String(i), label: (inHome(path) ? parts[i].slice(common) : parts[i].slice(-1)).join("/") || basename(path), path }));
}

async function head(path: string, n = 4096): Promise<string> {
  const f = await open(path, "r");
  try { const b = Buffer.alloc(n); const { bytesRead } = await f.read(b, 0, n, 0); return b.subarray(0, bytesRead).toString("utf8"); }
  finally { await f.close(); }
}

export function titleOf(kind: Kind, text: string): string | undefined {
  if (kind === "html") {
    const m = text.match(/<title[^>]*>([^<]{1,200})<\/title>/i) ?? text.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i);
    return m ? decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() || undefined : undefined;
  }
  if (kind === "md") {
    const m = text.match(/^#\s+(.{1,200})$/m);
    return m ? m[1].replace(/[*_`]/g, "").trim() : undefined;
  }
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/&mdash;/g, "—");
}

export function pickMain(docs: FileEntry[]): FileEntry | null {
  const depth = (d: FileEntry) => d.p.split("/").length;
  const shallow = [...docs].sort((a, b) => depth(a) - depth(b) || b.mtime - a.mtime);
  const by = (re: RegExp) => shallow.find((d) => re.test(basename(d.p)));
  return by(/^index\.html?$/i) ?? by(/^(report|summary|readme)\.(html?|md)$/i)
    ?? shallow.find((d) => d.kind === "html") ?? shallow.find((d) => d.kind === "md") ?? shallow[0] ?? null;
}

export class ReportIndex {
  groups: Group[] = [];
  scannedAt = 0;
  scanMs = 0;
  private titles = new Map<string, { mtime: number; title?: string }>();
  private scanning: Promise<void> | null = null;
  constructor(public roots: Root[]) {}

  rootById(id: string) { return this.roots.find((r) => r.id === id); }

  refresh(): Promise<void> {
    if (!this.scanning) this.scanning = this.scan().finally(() => (this.scanning = null));
    return this.scanning;
  }

  private async scan() {
    const t0 = performance.now();
    const groups = new Map<string, Group>();
    let count = 0;
    for (const root of this.roots) {
      const walk = async (dir: string, depth: number) => {
        if (count > MAX_FILES || depth > 8) return;
        let ents;
        try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (e.name.startsWith(".") && e.name !== ".") continue;
          const full = join(dir, e.name);
          if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(full, depth + 1); continue; }
          if (!e.isFile()) continue;
          const kind = KINDS[extname(e.name).toLowerCase()];
          if (!kind) continue;
          const rel = relative(root.path, full);
          const first = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : "";
          const key = `${root.id}:${first || rel}`;
          let g = groups.get(key);
          if (!g) {
            g = { key, root: root.id, dir: first, name: first || rel, mtime: 0, main: null, docs: [], images: [], imageCount: 0 };
            groups.set(key, g);
          }
          if (kind === "img" && ++g.imageCount > IMAGES_PER_GROUP * 3) continue;
          let st;
          try { st = await stat(full); } catch { continue; }
          count++;
          const f: FileEntry = { p: rel, kind, size: st.size, mtime: Math.round(st.mtimeMs) };
          g.mtime = Math.max(g.mtime, f.mtime);
          if (kind === "img") g.images.push(f); else g.docs.push(f);
        }
      };
      await walk(root.path, 0);
    }
    const list = [...groups.values()];
    for (const g of list) {
      g.images.sort((a, b) => b.mtime - a.mtime);
      g.images = g.images.slice(0, IMAGES_PER_GROUP);
      g.docs.sort((a, b) => b.mtime - a.mtime);
      g.main = pickMain(g.docs) ?? g.images[0] ?? null;
      const root = this.rootById(g.root)!;
      if (g.main && (g.main.kind === "html" || g.main.kind === "md")) await this.title(root, g.main);
      if (g.main?.title && g.dir === "") g.name = g.main.title;
    }
    list.sort((a, b) => b.mtime - a.mtime);
    this.groups = list;
    this.scannedAt = Date.now();
    this.scanMs = Math.round(performance.now() - t0);
  }

  async title(root: Root, f: FileEntry) {
    const key = `${root.id}:${f.p}`;
    const hit = this.titles.get(key);
    if (hit && hit.mtime === f.mtime) { f.title = hit.title; return; }
    try { f.title = titleOf(f.kind, await head(join(root.path, f.p))); } catch {}
    this.titles.set(key, { mtime: f.mtime, title: f.title });
  }

  async groupDetail(key: string) {
    const g = this.groups.find((x) => x.key === key);
    if (!g) return null;
    const root = this.rootById(g.root)!;
    for (const d of g.docs.slice(0, 200)) if (d.kind === "html" || d.kind === "md") await this.title(root, d);
    return g;
  }
}

/** Resolves a path under a root; refuses anything that leaves it (.., symlinks out). */
export async function resolveUnder(root: Root, rel: string): Promise<string | null> {
  if (rel.includes("\0")) return null;
  try {
    const base = await realpath(root.path);
    const full = await realpath(join(base, rel));
    return full === base || full.startsWith(base + "/") ? full : null;
  } catch { return null; }
}
