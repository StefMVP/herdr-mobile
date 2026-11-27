// Live terminal: xterm.js over a WebSocket to the core's attach stream.
// Loaded on demand so the inbox stays small and fast.
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const KEYS: Record<string, string> = {
  esc: "\x1b", tab: "\t", stab: "\x1b[Z", enter: "\r", up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", "ctrl+c": "\x03", "/": "/",
};

export type Term = {
  key(name: string): void;
  paste(text: string, enter: boolean): void;
  setMod(mod: "ctrl" | "alt", on: boolean, used: () => void): void;
  toggleKeyboard(): boolean;
  focusStream(on: boolean): void;
  dispose(): void;
};

type Opts = { links: RegExp; wide: boolean; cols: number; rows: number; fontSize: number; theme: ITheme; onNote(s: string): void; onLink(url: string): void; onKeyboard?(open: boolean): void };

export function openTerm(host: HTMLElement, wrap: HTMLElement, addr: string, o: Opts): Term {
  const term = new Terminal({
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, "JetBrains Mono", monospace',
    fontSize: o.fontSize, lineHeight: 1.18, scrollback: 5000, cursorBlink: false, allowProposedApi: true, theme: o.theme,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
  input?.setAttribute("inputmode", "none"); // the keyboard opens only from the keyboard button

  let kbOpen = false;
  const mods = { ctrl: null as null | (() => void), alt: null as null | (() => void) };
  let ws: WebSocket | null = null;
  let disposed = false;
  let retry = 0;
  const enc = new TextEncoder();
  const raw = (s: string) => { if (ws?.readyState === 1) ws.send(enc.encode(s)); };
  /** Applies a pending ctrl/alt to what the user types next. */
  const send = (d: string) => {
    if (mods.ctrl && d.length === 1) {
      const c = d.toLowerCase().charCodeAt(0);
      if (c >= 97 && c <= 122) d = String.fromCharCode(c - 96);
      mods.ctrl(); mods.ctrl = null;
    }
    if (mods.alt) { d = "\x1b" + d; mods.alt(); mods.alt = null; }
    raw(d);
  };
  const size = () => {
    if (o.wide) { term.resize(o.cols, o.rows); return { cols: o.cols, rows: o.rows }; }
    const d = fit.proposeDimensions();
    const cols = Math.max(30, d?.cols ?? 60), rows = Math.max(8, d?.rows ?? 30);
    term.resize(cols, rows);
    return { cols, rows };
  };
  term.onData(send);
  term.onBinary((d) => { if (ws?.readyState === 1) ws.send(Uint8Array.from(d, (c) => c.charCodeAt(0))); });
  term.registerLinkProvider({
    provideLinks(y, cb) {
      const line = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? "";
      const re = new RegExp(o.links.source, "g");
      const out: any[] = [];
      for (let m; (m = re.exec(line)); ) {
        const text = m[0].replace(/[.,;:)\]]+$/, "");
        out.push({ text, range: { start: { x: m.index + 1, y }, end: { x: m.index + text.length, y } }, activate: () => o.onLink(text) });
      }
      cb(out);
    },
  });

  const bg = String(o.theme.background ?? ""), fg = String(o.theme.foreground ?? "");
  const connect = () => {
    if (disposed) return;
    const { cols, rows } = size();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/term?t=${encodeURIComponent(addr)}&cols=${cols}&rows=${rows}&bg=${encodeURIComponent(bg)}&fg=${encodeURIComponent(fg)}`);
    ws.binaryType = "arraybuffer";
    let fresh = true;
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        const m = JSON.parse(e.data);
        if (m.t === "attached") { retry = 0; o.onNote(""); }
        else if (m.t === "closed") o.onNote(m.why?.reason === "exited" ? "The program exited." : "Reconnecting…");
        else if (m.t === "error") o.onNote(m.message);
        return;
      }
      if (fresh) { term.reset(); fresh = false; }
      term.write(new Uint8Array(e.data));
    };
    ws.onclose = () => { if (!disposed) { o.onNote("Reconnecting…"); setTimeout(connect, Math.min(5000, 400 * 2 ** retry++)); } };
  };
  connect();

  let timer = 0;
  const onResize = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (o.wide) return;
      const { cols, rows } = size();
      if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "resize", cols, rows }));
    }, 120);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(wrap);
  // iOS: keep the key bar above the on-screen keyboard.
  const vv = window.visualViewport;
  const onVV = () => { const p = wrap.closest(".term") as HTMLElement | null; if (p && vv) p.style.height = `${vv.height}px`; onResize(); };
  vv?.addEventListener("resize", onVV);

  return {
    key(name) { raw(KEYS[name] ?? name); },
    paste(text, enter) { term.paste(text); if (enter) setTimeout(() => raw("\r"), 60); },
    setMod(mod, on, used) { mods[mod] = on ? used : null; },
    toggleKeyboard() {
      // A tap on the terminal focuses its hidden input with no keyboard, so track the keyboard state here
      // and do not trust document.activeElement. iOS opens the keyboard only for a focus inside the tap.
      if (!input) return false;
      if (kbOpen) { kbOpen = false; input.blur(); input.setAttribute("inputmode", "none"); return false; }
      kbOpen = true;
      input.blur();
      input.setAttribute("inputmode", "text");
      input.focus({ preventScroll: true });
      term.focus();
      input.addEventListener("blur", () => { kbOpen = false; input.setAttribute("inputmode", "none"); o.onKeyboard?.(false); }, { once: true });
      return true;
    },
    focusStream(on) { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "focus", on })); },
    dispose() { disposed = true; ro.disconnect(); vv?.removeEventListener("resize", onVV); ws?.close(); term.dispose(); },
  };
}
