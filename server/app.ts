// Herdr desktop app actions (`herdr-app do`), Hex dictation, and folders for a new space.
import { readdir, stat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";

const APP = process.env.HM_APP ?? "herdr-app";
const HEX = process.env.HM_HEX ?? "hex";

async function exec(argv: string[], ms: number): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), ms);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  return { code, out, err };
}

/** Runs one app action. The app answers with JSON: a result or {error}. */
export async function appDo(action: string, args: Record<string, unknown>): Promise<any> {
  const r = await exec([APP, "do", action, JSON.stringify(args)], 15_000);
  let j: any;
  try { j = JSON.parse(r.out); } catch { throw new Error((r.err || r.out).trim() || `herdr-app exit ${r.code}`); }
  if (j?.error) throw new Error(String(j.error));
  return j;
}

type AppLs = { spaces: { id: string; name: string; tabs: { id: string; terminals: { terminal: string; pane: string }[] }[] }[] };
async function appLs(): Promise<AppLs> {
  const r = await exec([APP, "ls"], 10_000);
  if (r.code) throw new Error("The Herdr app is not open on the server.");
  return JSON.parse(r.out);
}

/** The Herdr way: close the pane. The last pane closes its space, so we confirm that too. */
export async function closeTerminal(addr: string, kill: (t: string) => Promise<unknown>) {
  const ls = await appLs().catch(() => null);
  for (const sp of ls?.spaces ?? []) {
    for (const tab of sp.tabs) {
      const hit = tab.terminals.find((t) => t.terminal === addr);
      if (!hit) continue;
      const last = sp.tabs.reduce((n, x) => n + x.terminals.length, 0) === 1;
      if (last) { await appDo("space.close", { id: sp.id, confirmed: true }); return { closed: "space", space: sp.id }; }
      await appDo("pane.close", { pane: hit.pane });
      return { closed: "terminal" };
    }
  }
  await kill(addr); // not in a space: end it in the core
  return { closed: "terminal" };
}

export const AGENTS: Record<string, string[]> = { claude: ["claude"], codex: ["codex"], opencode: ["opencode"], agy: ["agy"], shell: [] };

export async function newSpace(b: { folder?: unknown; name?: unknown; agent?: unknown }) {
  const home = homedir();
  const folder = String(b.folder ?? "").replace(/^~(?=\/|$)/, home);
  if (!folder.startsWith(home + "/") && folder !== home) throw new Error("folder must be in your home");
  if (!(await stat(folder).catch(() => null))?.isDirectory()) throw new Error("folder not found");
  const argv = AGENTS[String(b.agent ?? "shell")];
  if (!argv) throw new Error("unknown agent");
  const name = String(b.name ?? "").trim().slice(0, 60);
  return appDo("space.new", { folder, focus: false, ...(name ? { name } : {}), ...(argv.length ? { argv } : {}) });
}

export async function closeSpace(id: string) {
  return appDo("space.close", { id, confirmed: true });
}

/** Git repos one level below each folder in HM_PROJECT_DIRS (":"-separated, default ~), newest first. */
export async function folders(env = process.env): Promise<{ path: string; name: string; m: number }[]> {
  const home = homedir();
  const out: { path: string; name: string; m: number }[] = [];
  const bases = (env.HM_PROJECT_DIRS ?? "~").split(":").filter(Boolean).map((b) => b.replace(/^~(?=\/|$)/, home));
  for (const base of bases) {
    for (const e of await readdir(base, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const path = join(base, e.name);
      const git = join(path, ".git");
      if (!existsSync(git)) continue;
      const m = (await stat(join(git, "index")).catch(() => stat(path)).catch(() => null))?.mtimeMs ?? 0;
      out.push({ path, name: path.slice(home.length + 1), m });
    }
  }
  return out.sort((a, b) => b.m - a.m);
}

/** Branch of the repo that holds `cwd` (reads .git/HEAD; worktrees too). Cached briefly. */
const branchCache = new Map<string, { at: number; b: string | null }>();
export function branchOf(cwd: string): string | null {
  if (!cwd) return null;
  const c = branchCache.get(cwd);
  if (c && Date.now() - c.at < 30_000) return c.b;
  let b: string | null = null;
  try {
    for (let d = cwd; d !== dirname(d); d = dirname(d)) {
      const g = join(d, ".git");
      if (!existsSync(g)) continue;
      const gitdir = statSync(g).isDirectory() ? g : readFileSync(g, "utf8").match(/gitdir:\s*(.+)/)?.[1]?.trim();
      const head = gitdir ? readFileSync(join(gitdir.startsWith("/") ? gitdir : join(d, gitdir), "HEAD"), "utf8").trim() : "";
      b = head.startsWith("ref: refs/heads/") ? head.slice(16) : head ? head.slice(0, 7) : null;
      break;
    }
  } catch {}
  branchCache.set(cwd, { at: Date.now(), b });
  return b;
}

/** Phone audio (webm or mp4) → 16 kHz WAV → the model selected in Hex. */
export async function dictate(audio: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hm-dictate-"));
  try {
    const src = join(dir, "in"), wav = join(dir, "in.wav");
    await writeFile(src, audio);
    const f = await exec(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ar", "16000", "-ac", "1", wav], 30_000);
    if (f.code) throw new Error("could not read the audio");
    const r = await exec([HEX, "transcribe", "--json", wav], 60_000);
    const j = JSON.parse(r.out || "{}");
    if (j.status === "error") { if (j.code === "no-speech") return ""; throw new Error(j.message ?? "Hex failed"); }
    return String(j.text ?? j.transcript ?? j.result?.text ?? "").trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
