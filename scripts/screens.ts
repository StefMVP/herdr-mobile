// README screenshots from the demo server (sample data only).
// Usage: bun scripts/demo.ts & bun scripts/screens.ts   -> docs/screens.png
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.argv[2] ?? "http://127.0.0.1:7799";
const tmp = mkdtempSync(join(tmpdir(), "hm-screens-"));
const browser = await localBrowser.launch({ headless: true, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true } as any);
const sh = await Stagehand.create({ browser } as any);
const page = (await browser.context.activePage()) ?? (await browser.context.newPage());
const shots: string[] = [];
const shot = async (path: string, wait: string, settle = 900) => {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(wait, { timeout: 15000 } as any);
  await page.waitForTimeout(settle);
  const f = join(tmp, `${shots.length}.png`);
  writeFileSync(f, await page.screenshot({ fullPage: false } as any));
  shots.push(f);
};
await shot("/inbox", ".sw");
await shot("/spaces/s1", ".leadcard", 1500);
await shot("/t/t1", ".xterm-rows", 1500);
await shot("/reports", "#list .row");
const out = join(import.meta.dir, "../docs/screens.png");
const r = Bun.spawnSync(["magick", ...shots, "-bordercolor", "#111113", "-border", "12", "+append", "-resize", "1600x", "-strip", "-colors", "256", out]);
if (r.exitCode) throw new Error(r.stderr.toString());
console.log(out);
await Promise.race([sh.close(), new Promise((res) => setTimeout(res, 3000))]);
process.exit(0);
