// Derives src/app/dark.css from the hand-written light stylesheets.
// Every colour declaration is re-mapped by its role (background, text, border) and emitted inside
// `@media (prefers-color-scheme: dark)` with the original selector and media chain, so the light CSS stays the
// single source of truth. Run `npm run theme:generate` after changing colours in globals.css, pulse.css or ios.css.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SOURCES = ["src/app/globals.css", "src/app/pulse.css", "src/app/ios.css"];
export const OUTPUT = "src/app/dark.css";

// Surfaces that are the page itself (not a card): they become the deepest tone.
const PAGE_BACKGROUNDS = new Set(["#f5f4ef", "#f3f6f1", "#f4f6f2", "#faf9f4"]);
const PAGE_L = 0.07;
const CARD_L = 0.115;

/* ---------- colour helpers ---------- */
export function parseColor(token) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(token);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1, kind: "hex" };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(token);
  if (fn) {
    const a = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: +fn[1], g: +fn[2], b: +fn[3], a, kind: "fn" };
  }
  return null;
}

export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function fromHsl({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (x, points) => {
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
};

/* ---------- role maps: light colour in, dark colour out ---------- */
function mapBackground(c, hexKey) {
  let { h, s, l } = toHsl(c);
  if (hexKey && PAGE_BACKGROUNDS.has(hexKey)) return { h: 150, s: 0.14, l: PAGE_L };
  // Faint dark overlays (hover/active tints) turn into faint light overlays.
  if (c.a < 0.5 && l < 0.4) return { r: 255, g: 255, b: 255 };
  // Faint white highlights sit on dark fills already (hero tracks): keep them.
  if (c.a < 0.3 && l >= 0.9) return { r: c.r, g: c.g, b: c.b };
  const chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
  if (l >= 0.88 && chroma < 0.1) {
    // Neutral surfaces: white cards sit above the page, insets are a touch lighter than the card.
    if (l >= 0.99) return { h: 150, s: 0.09, l: CARD_L };
    return { h: 150, s: 0.09, l: 0.15 - (l - 0.9) * 0.4 };
  }
  if (l >= 0.66) {
    // Tinted/pastel fills become deep tints of the same hue.
    return { h, s: Math.min(s * 0.6, 0.45), l: 0.13 + (0.95 - l) * 0.35 };
  }
  if (l >= 0.4) return { h, s, l: clamp(l, 0.42, 0.62) };
  return { h, s, l: l + (0.4 - l) * 0.16 };
}

function mapText(c) {
  const { h, s, l } = toHsl(c);
  if (l >= 0.7) return { h, s, l };
  const next = lerp(l, [[0, 0.97], [0.15, 0.92], [0.3, 0.8], [0.45, 0.7], [0.6, 0.66], [0.7, 0.7]]);
  return { h, s: s * 0.85, l: next };
}

function mapBorder(c) {
  const { h, s, l } = toHsl(c);
  // Translucent white edges (glass highlights, lines on dark hero cards) stay white but get subtler.
  if (c.a < 1 && l >= 0.9) return { r: 255, g: 255, b: 255, alpha: Math.min(c.a, 0.14) };  if (l >= 0.75) return { h: s < 0.3 ? 150 : h, s: Math.min(s, 0.2) * 0.6, l: clamp(0.26 - (l - 0.75) * 0.4, 0.15, 0.26) };
  return mapText(c);
}

const MAPPERS = { bg: mapBackground, text: mapText, border: mapBorder };

function formatColor(rgb, original) {
  const a = rgb.alpha ?? original.a;
  if (original.kind === "fn" || a < 1) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${+a.toFixed(3)})`;
  return `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function mapColor(token, role) {
  const original = parseColor(token);
  if (!original) return token;
  const hexKey = original.kind === "hex" && original.a === 1 ? token.toLowerCase().replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : null;
  const mapped = MAPPERS[role](original, hexKey);
  const rgb = "r" in mapped ? mapped : fromHsl(mapped);
  return formatColor(rgb, original);
}

/* ---------- declaration roles ---------- */
const COLOR_SOURCE = "#[0-9a-fA-F]{8}\\b|#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3,4}\\b|rgba?\\([^)]*\\)";
const COLOR_TOKEN = new RegExp(COLOR_SOURCE, "g");
const HAS_COLOR = new RegExp(COLOR_SOURCE);

function roleOf(prop) {
  if (/^(background|background-color|background-image)$/.test(prop)) return "bg";
  if (/^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color)$/.test(prop)) return "text";
  if (/^(border|outline|column-rule)(-[a-z]+)*$/.test(prop)) return "border";
  if (prop.startsWith("--")) {
    if (/bg|background/.test(prop)) return "bg";
    if (/border/.test(prop)) return "border";
    return "text";
  }
  return null;
}

function splitDeclarations(body) {
  const out = [];
  let depth = 0, current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { out.push(current); current = ""; } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

function darkDeclarations(body, selector) {
  const out = [];
  for (const raw of splitDeclarations(body)) {
    const colon = raw.indexOf(":");
    if (colon < 0) continue;
    const prop = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim();
    // Root tokens are maintained by hand in DARK_TOKENS below.
    if (prop.startsWith("--") && selector.trim() === ":root") continue;
    const role = roleOf(prop);
    if (!role || !HAS_COLOR.test(value)) continue;
    const mapped = value.replace(COLOR_TOKEN, (token) => mapColor(token, role));
    if (mapped !== value) out.push(`${prop}: ${mapped}`);
  }
  return out;
}

/* ---------- minimal CSS walker (flat rules and nested @media only) ---------- */
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }

function walk(css, chain, emit) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open < 0) break;
    if (semi >= 0 && semi < open && css.slice(i, semi).trim().startsWith("@")) { i = semi + 1; continue; }
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    i = j;
    if (prelude.startsWith("@media")) walk(body, [...chain, prelude], emit);
    else if (prelude.startsWith("@")) continue; // @theme, @keyframes, @font-face, @supports are not themed
    else emit(prelude, body, chain);
  }
}

/* ---------- hand-written tokens and third-party overrides ---------- */
const DARK_TOKENS = `  color-scheme: dark;
  --background: #0e1311;
  --foreground: #e8f0ea;
  --surface-1: #1a211e;
  --surface-2: #222b27;
  --text-primary: #e8f0ea;
  --text-secondary: #b8c8bd;
  --text-muted: #8fa196;
  --gridline: #27322c;
  --axis: #36433b;
  --border: rgba(255, 255, 255, 0.1);
  --series-blue: #5b97ee;
  --series-orange: #ff7a5c;
  --series-aqua: #22c196;
  --series-yellow: #f0b429;
  --series-magenta: #ec75a8;
  --series-green: #2fb985;
  --series-violet: #9b84ee;
  --series-red: #ef6469;
  --status-good: #2fb985;
  --status-warning: #f0b429;
  --status-serious: #f2825f;
  --status-critical: #ef6469;
  --delta-good: #3ec796;
  --series-run: #f2845f;
  --series-hrv: #22c196;
  --series-rhr: #ec6277;
  --series-vo2: #5b97ee;
  --series-weight: #9b84ee;
  --series-steps: #e0a81d;
  --series-chronic: #9db0a4;
  --p-ink: #e8f0ea;
  --p-text: #cddad1;
  --p-muted: #9db0a4;
  --p-line: #29342e;
  --p-card: #1a211e;
  --p-soft: #222b27;
  --p-good: #2fb985;
  --p-warn: #e0a22a;
  --p-bad: #ef6469;`;

const EXTRAS = `/* Recharts draws with inline attributes and an inline white tooltip. */
.recharts-default-tooltip { background-color: var(--p-card) !important; border-color: var(--p-line) !important; color: var(--p-text) !important; }
.recharts-tooltip-label, .recharts-tooltip-item { color: var(--p-text) !important; }
.recharts-cartesian-axis-tick-value { fill: var(--text-muted); }
.recharts-cartesian-grid line { stroke: var(--gridline); }
/* Elements whose light colour is a deliberate highlight on a dark hero keep it. */
.p-dot { background: #c6f27a; box-shadow: 0 0 0 4px rgba(198, 242, 122, 0.2); }
/* Segmented controls: the selected thumb is lighter than its track, like UISegmentedControl. */
.p-chart-controls button[aria-pressed="true"] { background: #38453e; color: var(--p-ink); box-shadow: none; }
/* Inputs and selects follow the dark colour scheme. */
input, select, textarea { color-scheme: dark; }
/* Photos and charts keep their own colours; only soften the brightest surfaces. */
.brand-icon { box-shadow: none; }`;

export function generateDarkCss(sources) {
  const blocks = [];
  for (const css of sources) {
    walk(stripComments(css), [], (selector, body, chain) => {
      const decls = darkDeclarations(body, selector);
      if (!decls.length) return;
      const rule = `${selector.replace(/\s*\n\s*/g, " ")} { ${decls.join("; ")}; }`;
      const wrapped = chain.reduceRight((inner, media) => `${media} { ${inner} }`, rule);
      blocks.push(wrapped);
    });
  }
  return `/* GENERATED by scripts/generate-dark-css.mjs from globals.css, pulse.css and ios.css. Do not edit by hand;
   run \`npm run theme:generate\`. Colours map by role: backgrounds go deep, dark text goes light, borders become hairlines. */
@media (prefers-color-scheme: dark) {
:root {
${DARK_TOKENS}
}
${blocks.join("\n")}
${EXTRAS}
}
`;
}

export function readSources(root = ".") {
  return SOURCES.map((file) => readFileSync(`${root}/${file}`, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = generateDarkCss(readSources());
  writeFileSync(OUTPUT, css);
  console.log(`${OUTPUT}: ${css.split("\n").length} lines`);
}
