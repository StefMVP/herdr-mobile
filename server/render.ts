import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const MD_CSS = `
:root{color-scheme:light;--bg:#fff;--fg:#1d2127;--mut:#5d6672;--line:#e3e6ea;--code:#f4f5f7;--th:#f8f9fa;--link:#0a58ca}
body.dark{color-scheme:dark;--bg:#111113;--fg:#ececf0;--mut:#9a9aa3;--line:#2e2e34;--code:#1f2026;--th:#1d1d21;--link:#8fb2ff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;padding:14px 14px 48px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg);overflow-wrap:anywhere}
h1{font-size:1.45em;line-height:1.25;margin:.2em 0 .6em}h2{font-size:1.2em;margin:1.4em 0 .5em;padding-bottom:.2em;border-bottom:1px solid var(--line)}
h3{font-size:1.05em;margin:1.2em 0 .4em}h4,h5,h6{font-size:1em;margin:1em 0 .3em}
p,ul,ol,blockquote,pre,table{margin:0 0 .85em}ul,ol{padding-left:1.3em}li{margin:.15em 0}li>p{margin:0}
a{color:var(--link)}img,video{max-width:100%;height:auto;border-radius:6px}
code{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:.1em .3em;border-radius:4px;overflow-wrap:anywhere}
pre{background:var(--code);padding:10px 12px;border-radius:8px;overflow-x:auto;-webkit-overflow-scrolling:touch}pre code{background:none;padding:0;overflow-wrap:normal;white-space:pre}
blockquote{margin-left:0;padding:.1em .9em;border-left:3px solid var(--line);color:var(--mut)}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 .85em}
table{border-collapse:collapse;font-size:13.5px;min-width:100%}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{background:var(--th);font-weight:600}
hr{border:0;border-top:1px solid var(--line);margin:1.4em 0}input[type=checkbox]{margin-right:.4em}
`;

export function renderMarkdownPage(md: string, name: string, theme: "light" | "dark" = "light"): string {
  const body = (marked.parse(md, { async: false }) as string)
    .replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>");
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? name;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${MD_CSS}</style></head><body class="${theme}">${body}</body></html>`;
}

// Mobile fixes for agent-written HTML reports: a viewport (many have none, which
// makes phones render them at 980px) and images that fit the screen.
const FIT = `<style data-hm>img,video{max-width:100%;height:auto}pre{overflow-x:auto}</style>`;
export function prepareHtml(html: string, home = ""): string {
  // Absolute paths below home (file:///home/user/x, "/home/user/x") point at the home route.
  if (home) {
    const h = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`(["'(])(?:file://)?${h}/`, "g"), "$1/f/h/");
  }
  const hasViewport = /<meta[^>]+name=["']?viewport/i.test(html);
  const add = (hasViewport ? "" : `<meta name="viewport" content="width=device-width,initial-scale=1">`) + FIT;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + add);
  return add + html;
}
