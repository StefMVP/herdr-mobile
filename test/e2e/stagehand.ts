// Mobile walkthrough with Stagehand on a local Chromium at iPhone 15 size.
// Usage: bun test/e2e/stagehand.ts <base-url> <terminal-address> <out-dir>
// It opens only the terminal you name, so real agents are not resized or marked seen.
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base, term = "hm-e2e", out = "/tmp/hm-e2e"] = process.argv.slice(2);
if (!base) { console.error("usage: bun test/e2e/stagehand.ts <base-url> [terminal] [out-dir]"); process.exit(2); }
mkdirSync(out, { recursive: true });

// Guard: the app resizes the terminal it opens and marks it seen. Refuse a real agent.
const facts0 = JSON.parse(Bun.spawnSync(["hc", "get", term, "--json"]).stdout.toString() || "{}");
if (facts0.status != null || facts0.state !== "live") {
  console.error(`refusing: ${term} is ${facts0.state ?? "missing"}${facts0.status ? ` and reports status (${facts0.status.app})` : ""}. Make one: hc run --bg --name hm-e2e bash`);
  process.exit(2);
}

// Fake microphone: Chromium loops a speech recording (HM_E2E_SPEECH). Without it, the mic step is skipped.
const speech = process.env.HM_E2E_SPEECH ?? "";
let micWav = "";
if (speech) {
  micWav = join(out, "mic.wav");
  Bun.spawnSync(["ffmpeg", "-loglevel", "error", "-y", "-i", speech, "-af", "aformat=channel_layouts=mono", "-ar", "48000", "-c:a", "pcm_s16le", micWav]);
}
const browser = await localBrowser.launch({ headless: true, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(micWav ? [`--use-file-for-fake-audio-capture=${micWav}`] : [])] } as any);
const sh = await Stagehand.create({ browser } as any);
const page = (await browser.context.activePage()) ?? (await browser.context.newPage());
const facts: Record<string, unknown> = {};
const errors: string[] = [];
await page.onConsole((m: any) => { if (m.type?.() === "error" || m.type === "error") { const t = String(m.text?.() ?? m.text); errors.push(t); log(`console: ${t}`); } });

const log = (m: string) => console.error(`step: ${m}`);
const shot = async (name: string) => (log(name), writeFileSync(join(out, `${name}.png`), await page.screenshot({ fullPage: false } as any)));
const ms = async (sel: string, timeout = 15000) => { const t = performance.now(); await page.waitForSelector(sel, { timeout } as any); return Math.round(performance.now() - t); };
const timing = () => page.evaluate(() => {
  const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  const paint = performance.getEntriesByName("first-contentful-paint")[0];
  return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), fcp: Math.round(paint?.startTime ?? -1), bytes: Math.round(performance.getEntriesByType("resource").reduce((s, r: any) => s + (r.transferSize || 0), n.transferSize || 0)) };
});

// Inbox (cold, then warm with the service worker)
await page.goto(`${base}/inbox`);
facts.inboxRowsMs = await ms(".sw");
facts.inboxCold = await timing();
await shot("01-inbox");
await page.reload();
facts.inboxWarmRowsMs = await ms(".sw");
facts.inboxWarm = await timing();
facts.inboxRows = await page.evaluate(() => document.querySelectorAll(".sw").length);
facts.searchHidden = await page.evaluate(() => getComputedStyle(document.getElementById("sl")!).display === "none");
await page.locator("#sb").click();
await page.evaluate(() => { const q = document.getElementById("q") as HTMLInputElement; q.value = "poe"; q.dispatchEvent(new Event("input")); });
await page.waitForTimeout(300);
facts.searchRows = await page.evaluate(() => document.querySelectorAll(".sw").length);
await shot("01c-inbox-search");
await page.locator("#sb").click();
await page.evaluate(() => (document.querySelector('#mode [data-v="all"]') as HTMLElement).click());
await page.waitForTimeout(300);
facts.inboxRowsAll = await page.evaluate(() => document.querySelectorAll(".sw").length);
await shot("01b-inbox-all");
await page.evaluate(() => (document.querySelector('#mode [data-v="leads"]') as HTMLElement).click());

// The + button stays on the inbox and opens the space jumper
await page.locator("#plus").click();
await ms(".sheet .act");
await page.waitForTimeout(400);
await shot("02-plus-sheet");
facts.plusSheetSpaces = await page.evaluate(() => document.querySelectorAll(".sheet [data-go]").length);
await page.evaluate(() => (document.querySelector('.sheet [data-x="newspace"]') as HTMLElement).click());
await ms(".sheet [data-f]");
await page.waitForTimeout(400);
await shot("02b-new-space");
facts.newSpaceFolders = await page.evaluate(() => document.querySelectorAll(".sheet [data-f]").length);
await page.evaluate(() => (document.querySelector(".scrim") as HTMLElement).click());
await page.locator("#plus").click();
await ms(".sheet [data-go]");
await page.evaluate(() => (document.querySelector(".sheet [data-go]") as HTMLElement)?.click());
await ms(".leadcard, .empty");
await page.waitForTimeout(600);
await shot("03-space");
await page.evaluate(() => (document.querySelector('#stabs [data-t="reports"]') as HTMLElement).click());
await ms("#sr .group, #sr .empty:not(:empty)");
await page.waitForTimeout(800);
facts.spaceReportsUrl = await page.url();
facts.spaceReports = await page.evaluate(() => document.querySelectorAll("#sr .row").length);
await shot("03c-space-reports");
facts.spaceUrl = await page.url();

// The space with the most terminals (read only: a space page does not resize or mark anything)
const busy = await page.evaluate(async () => { const st = await (await fetch("/api/state")).json(); return st.spaces.map((sp: any) => [sp.id, st.terminals.filter((t: any) => t.space === sp.id).length]).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]; });
if (busy) { await page.goto(`${base}/spaces/${busy}`); await ms(".leadcard"); await page.waitForTimeout(1200); await shot("03b-space-busy"); }
await page.goto(`${base}/spaces`);
await ms(".group .row");
await shot("04-spaces");

// Terminal (throwaway one)
await page.goto(`${base}/t/${encodeURIComponent(term)}`);
facts.termRenderMs = await ms(".xterm-screen", 20000);
await page.waitForFunction?.(() => !document.getElementById("note") || (document.getElementById("note") as HTMLElement).style.display === "none", { timeout: 10000 } as any).catch(() => {});
await page.waitForTimeout(800);
facts.termGrid = await page.evaluate(() => { const r = document.querySelector(".xterm-rows"); return r ? { rows: r.children.length, text: (r as HTMLElement).innerText.slice(0, 200) } : null; });
await shot("05-terminal");
await page.locator("#cmp").click();
await ms("#ta");
await page.waitForTimeout(400);
await shot("06-compose");
await page.locator("#ta").fill?.("echo typed-from-phone");
await page.evaluate(() => { const ta = document.getElementById("ta") as HTMLTextAreaElement; if (!ta.value) { ta.value = "echo typed-from-phone"; ta.dispatchEvent(new Event("input")); } });
await page.locator("#send").click();
await page.waitForTimeout(1500);
facts.termAfterSend = await page.evaluate(() => (document.querySelector(".xterm-rows") as HTMLElement)?.innerText.includes("typed-from-phone"));
await shot("07-terminal-after-send");
// Mic: record about 3 s from the fake microphone, then Hex on the server transcribes it into the write sheet.
if (micWav) {
  log("mic: open compose");
  await page.locator("#cmp").click();
  await ms("#cmic");
  log("mic: record");
  await page.evaluate(() => { (document.getElementById("ta") as HTMLTextAreaElement).value = ""; });
  await page.waitForTimeout(500); // the sheet slides up
  await page.evaluate(() => (document.getElementById("cmic") as HTMLElement).click());
  await ms('#cmic[data-state="recording"]', 20000);
  log("mic: recording");
  await page.waitForTimeout(3000);
  const t0 = performance.now();
  log("mic: stop");
  // A DOM click: Stagehand's click waits for the pulsing button to stop moving.
  await page.evaluate(() => (document.getElementById("cmic") as HTMLElement).click());
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => ({ v: (document.getElementById("ta") as HTMLTextAreaElement | null)?.value ?? null, toast: document.querySelector(".toast")?.textContent ?? "", cls: document.getElementById("cmic")?.className ?? "gone" }));
    if (i % 5 === 0) log(`mic: ${JSON.stringify(st)}`);
    if (st.v) break;
    await page.waitForTimeout(500);
  }
  facts.dictateMs = Math.round(performance.now() - t0);
  facts.dictated = await page.evaluate(() => (document.getElementById("ta") as HTMLTextAreaElement | null)?.value ?? null);
  await page.waitForTimeout(300);
  await shot("06b-dictated");
  await page.evaluate(() => { localStorage.clear(); (document.querySelector(".scrim") as HTMLElement)?.click(); });
}
// Keyboard button: tap the terminal first (its input gets focus with no keyboard), then the button must open it.
await page.locator(".xterm-screen").click();
await page.locator("#kbd").click();
await page.waitForTimeout(200);
facts.keyboardOpen = await page.evaluate(() => { const i = document.querySelector(".xterm-helper-textarea") as HTMLElement; return document.activeElement === i && i.getAttribute("inputmode") === "text"; });
await (page as any).type("echo kb-ok");
await (page as any).keyPress("Enter");
await page.waitForTimeout(1200);
facts.keyboardTyped = await page.evaluate(() => (document.querySelector(".xterm-rows") as HTMLElement)?.innerText.includes("kb-ok"));
await page.locator("#kbd").click();
await page.evaluate(() => { const k = document.getElementById("kp")!; k.scrollLeft = k.clientWidth; });
await page.waitForTimeout(300);
await shot("07b-keys-page2");
await page.evaluate(() => (document.querySelector('[data-k="txt"]') as HTMLElement).click());
await ms(".textview");
await page.waitForTimeout(600);
await shot("08-textview");

// Reports
const tr = performance.now();
await page.goto(`${base}/reports`);
await ms(".group .row", 20000);
facts.reportsListMs = Math.round(performance.now() - tr);
facts.reportsShown = await page.evaluate(() => document.querySelectorAll(".group .row").length);
await shot("09-reports");
await page.goto(`${base}/reports?since=24h`);
await ms("#list .group, #list .empty:not(:empty)");
await page.waitForTimeout(300);
facts.reports24h = await page.evaluate(() => document.querySelectorAll(".group .row").length);
await shot("09b-reports-24h");
for (const [name, kind] of [["10-report-html", "html"], ["11-report-md", "md"]] as const) {
  await page.goto(`${base}/reports?q=.${kind}`);
  await ms(".group .row a.rb");
  const href = await page.evaluate(() => (document.querySelector(".group .row a.rb") as HTMLAnchorElement).getAttribute("href"));
  const t0 = performance.now();
  await page.goto(`${base}${href}`);
  await ms("iframe");
  await page.waitForFunction?.(() => !document.querySelector(".progress"), { timeout: 15000 } as any).catch(() => {});
  facts[`${kind}OpenMs`] = Math.round(performance.now() - t0);
  facts[`${kind}Href`] = href;
  await page.waitForTimeout(500);
  await shot(name);
}
await page.goto(`${base}/reports`);
await ms(".group .row");
const gk = await page.evaluate(() => (document.querySelector(".group .row a.more") as HTMLAnchorElement)?.getAttribute("href"));
if (gk) { await page.goto(`${base}${gk}`); await ms(".label"); await page.waitForTimeout(1200); await shot("12-report-group"); }

await page.goto(`${base}/settings`);
await ms(".seg");
await page.waitForTimeout(300);
await shot("13-settings");
facts.consoleErrors = errors;
writeFileSync(join(out, "facts.json"), JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 2));
await Promise.race([sh.close(), new Promise((r) => setTimeout(r, 3000))]);
process.exit(0);
