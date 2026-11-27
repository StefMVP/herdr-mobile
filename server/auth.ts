// Access control. The server listens on loopback only; `tailscale serve` is the
// only way in. Serve adds the caller's Tailscale identity headers and strips any
// the client sent. We allow the listed logins on the listed devices only; there are no defaults.

export type AuthConfig = { logins: Set<string>; devices: Set<string> };

export function authConfig(env = process.env): AuthConfig {
  const list = (v: string | undefined) => new Set((v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return { logins: list(env.HM_ALLOWED_LOGINS), devices: list(env.HM_ALLOWED_DEVICES) };
}

type Who = { device: string; login: string; at: number };
const cache = new Map<string, Who>();

export async function whois(ip: string, run = runWhois): Promise<Who | null> {
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  const j = await run(ip);
  if (!j) return null;
  const device = String(j.Node?.ComputedName ?? j.Node?.Hostinfo?.Hostname ?? j.Node?.Name ?? "").split(".")[0].toLowerCase();
  const who = { device, login: String(j.UserProfile?.LoginName ?? "").toLowerCase(), at: Date.now() };
  cache.set(ip, who);
  return who;
}

async function runWhois(ip: string): Promise<any> {
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  const p = Bun.spawn(["tailscale", "whois", "--json", ip], { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) return null;
  try { return JSON.parse(out); } catch { return null; }
}

export type Verdict = { ok: true; login: string; device: string } | { ok: false; why: string };

export async function check(req: Request, peer: string | undefined, cfg: AuthConfig, run = runWhois): Promise<Verdict> {
  if (peer !== "127.0.0.1" && peer !== "::1" && peer !== "::ffff:127.0.0.1") return { ok: false, why: "not via tailscale serve" };
  const login = (req.headers.get("tailscale-user-login") ?? "").toLowerCase();
  if (!login || !cfg.logins.has(login)) return { ok: false, why: "login not allowed" };
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return { ok: false, why: "no client address" };
  const who = await whois(ip, run);
  if (!who || who.login !== login) return { ok: false, why: "unknown device" };
  if (!cfg.devices.has(who.device)) return { ok: false, why: `device ${who.device} not allowed` };
  return { ok: true, login, device: who.device };
}

/** Mutating requests must come from our own page: a report in a sandboxed frame cannot set this header without a preflight we never answer. */
export function sameOriginWrite(req: Request): boolean {
  if (req.headers.get("x-hm") !== "1") return false;
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin || origin === `https://${req.headers.get("host")}`;
}
