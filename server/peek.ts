// The newest thing an agent said, taken from its screen: the last prose paragraph above the input box.
const CHROME = [
  /^[\s─━═╌┄\-│┃╭╮╰╯┌┐└┘├┤┬┴┼╪╫▔▁]*$/, // empty lines and box borders
  /^\s*[>›❯?│┃]/, // input box and hints
  /shortcuts|shift\+tab|ctrl\+[a-z] to|esc to interrupt|accept-edits|bypass permissions/i,
  /^\s*[●○]\s*\[\d\d:\d\d/, // background task list
  /│.*│/, // table rows
  /^\s*(?:[└⎿]\s*)?Tip:/,
];
const STATUS = /^\s*[○◐✻✶✢✳✽·…⎿└▸▶\u2800-\u28FF]|^\s*<hc from=/; // also hints and messages from other agents // thoughts, spinners, tool output
const TOOL = /^\s*[●⏺]\s*(?:…|\(|(?:Ran|Running|Explored|Read|Reading|Thought|Thinking|Bash|Edit|Edited|Write|Wrote|Update|Updated|Search|Searched|Task|Agent|Fetch|List|Grep|Glob|Called|Listed|Killed|Waiting|Cooked|Worked|Brewed|Churned)\b|\w+\()/;
const BULLET = /^\s*[●⏺]\s+/;

export function lastSaid(screen: string): string {
  const lines = screen.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => !CHROME.some((re) => re.test(l)));
  const prose = (l: string) => !STATUS.test(l) && !TOOL.test(l) && (BULLET.test(l) || /^\s{1,4}\S/.test(l) || /^\S/.test(l));
  let end = lines.length - 1;
  while (end >= 0 && !prose(lines[end])) end--;
  if (end < 0) return "";
  let start = end;
  // A paragraph: continuation lines go up to its first line (a bullet, or the start of the block).
  while (start > 0 && end - start < 5 && prose(lines[start - 1]) && !BULLET.test(lines[start])) start--;
  return lines.slice(start, end + 1).map((l) => l.replace(BULLET, "").trim()).join(" ").replace(/^.*<\/hc>\s*/, "").replace(/\s+/g, " ").slice(0, 280);
}
