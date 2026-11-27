// Builds web/src into web/dist: hashed, split bundles, the shell page and the service worker.
import { rm, mkdir, cp, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "web/dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const r = await Bun.build({
  entrypoints: [join(root, "web/src/app.ts")],
  outdir: dist,
  splitting: true,
  minify: true,
  target: "browser",
  naming: { entry: "[name].[hash].[ext]", chunk: "chunk-[hash].[ext]", asset: "[name].[hash].[ext]" },
});
if (!r.success) { for (const l of r.logs) console.error(l); process.exit(1); }

const out = r.outputs.map((o) => o.path.slice(dist.length + 1));
const js = out.find((p) => /^app\.[^/]+\.js$/.test(p))!;
const css = out.filter((p) => p.endsWith(".css"));
const appCss = css.find((p) => p.startsWith("app."));
await cp(join(root, "web/public"), dist, { recursive: true });

const html = (await Bun.file(join(root, "web/public/index.html")).text())
  .replace("<!--css-->", appCss ? `<link rel="stylesheet" href="/${appCss}">` : "")
  .replace("<!--js-->", `<script type="module" src="/${js}"></script>`);
await Bun.write(join(dist, "index.html"), html);

const version = Bun.hash(out.join(",") + html).toString(36);
const shell = ["/", `/${js}`, ...(appCss ? [`/${appCss}`] : []), "/manifest.webmanifest", "/icon-192.png"];
const sw = (await Bun.file(join(root, "web/public/sw.js")).text()).replace("__VERSION__", version).replace("__SHELL__", JSON.stringify(shell));
await Bun.write(join(dist, "sw.js"), sw);

let total = 0;
for (const f of await readdir(dist)) total += Bun.file(join(dist, f)).size;
console.log(`built ${out.length} files, ${(total / 1024).toFixed(0)} KB, version ${version}`);
for (const o of r.outputs) console.log(`  ${o.path.slice(dist.length + 1)} ${(o.size / 1024).toFixed(1)} KB`);
