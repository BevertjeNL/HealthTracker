import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateDarkCss, mapColor, parseColor, readSources } from "../scripts/generate-dark-css.mjs";
import { SPLASH_DEVICES, splashStartupImages } from "../src/lib/splash-screens.ts";
import { existsSync } from "node:fs";

const lum = ({ r, g, b }) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("dark.css is up to date with the light stylesheets (run npm run theme:generate)", () => {
  assert.equal(readFileSync("src/app/dark.css", "utf8"), generateDarkCss(readSources()));
});

test("backgrounds go deep, dark text goes light, white text on fills stays white", () => {
  assert.ok(lum(parseColor(mapColor("#ffffff", "bg"))) < 0.03);
  assert.ok(lum(parseColor(mapColor("#f5f4ef", "bg"))) < lum(parseColor(mapColor("#ffffff", "bg"))), "page is deeper than a card");
  assert.ok(lum(parseColor(mapColor("#153c2e", "text"))) > 0.6);
  assert.equal(mapColor("#ffffff", "text"), "#ffffff");
});

test("pastel fills with dark text keep readable contrast after mapping", () => {
  for (const [bg, fg] of [["#fbd9cb", "#173b2d"], ["#d0ed77", "#153c2e"], ["#9fd4f2", "#153c2e"], ["#fff7e5", "#704606"], ["#eef2e9", "#28443a"]]) {
    const r = ratio(parseColor(mapColor(bg, "bg")), parseColor(mapColor(fg, "text")));
    assert.ok(r >= 4.5, `${bg} / ${fg} = ${r.toFixed(2)}`);
  }
});

test("translucent white edges stay white and subtle", () => {
  assert.equal(mapColor("rgba(255, 255, 255, .7)", "border"), "rgba(255, 255, 255, 0.14)");
});

test("every launch image exists, light and dark", () => {
  const images = splashStartupImages();
  assert.equal(images.length, SPLASH_DEVICES.length * 2);
  for (const { url, media } of images) {
    assert.ok(existsSync(`public${url}`), url);
    assert.match(media, /orientation: portrait/);
  }
});
