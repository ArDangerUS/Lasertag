import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-Lasertag/57226a4d-0325-5c16-8408-d28f15db07df/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
await p.goto("http://localhost:3125/", { waitUntil: "networkidle" });
await p.selectOption("select", { label: "ТРЦ Gorodok" });
await p.waitForTimeout(900);
// select all activity cards to test scroll + legend
const cards = p.locator("section", { hasText: "Оберіть розваги" }).locator("button");
// click each activity card (the toggle cards)
const acts = await p.locator("section:has-text('Оберіть розваги') > div > button").all();
for (const c of acts) { try { await c.click(); await p.waitForTimeout(60); } catch {} }
await p.waitForTimeout(500);
// pick lasertag 10:00 to test cross-activity blocking
const sec = p.locator("section", { hasText: "Оберіть розваги" });
await sec.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/shot-acts-all.png`, fullPage: false });
// check body horizontal overflow
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("bodyHorizontalOverflowPx:", overflow);
await b.close(); console.log("ok");
