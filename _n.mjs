import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-Lasertag/57226a4d-0325-5c16-8408-d28f15db07df/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function shot(w, name) {
  const p = await (await b.newContext({ viewport: { width: w, height: 1100 } })).newPage();
  await p.goto("http://localhost:3126/", { waitUntil: "networkidle" });
  await p.selectOption("select", { label: "ТРЦ Gorodok" });
  await p.waitForTimeout(800);
  const acts = await p.locator("section:has-text('Оберіть розваги') > div > button").all();
  for (const c of acts) { try { await c.click(); await p.waitForTimeout(40); } catch {} }
  await p.waitForTimeout(400);
  const sec = p.locator("section", { hasText: "Оберіть розваги" });
  await sec.scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await sec.screenshot({ path: `${OUT}/shot-noscroll-${name}.png` });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // check the calendar section internal scroll
  const secOv = await sec.evaluate(el => { const g = el.querySelector('div > div'); return 0; });
  console.log(`${name} w=${w} bodyOverflow=${ov}`);
  await p.close();
}
await shot(1400, "desktop");
await shot(900, "tablet");
await b.close(); console.log("ok");
