import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-Lasertag/57226a4d-0325-5c16-8408-d28f15db07df/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
await p.goto("http://localhost:3127/", { waitUntil: "networkidle" });
// select lasertag activity card
const sec = p.locator("section", { hasText: "Оберіть розваги" });
await sec.locator("> div > button").first().click(); // Лазертаг
await p.waitForTimeout(700);
// click two adjacent free slots: rows are grids; first activity column cells.
// find free cell buttons in the calendar: they are buttons with border-[#E5E5E5] and empty
const rows = sec.locator("div.grid.gap-1\\.5, div.grid.gap-1");
// simpler: click cell buttons by nth in the slot grid — use empty buttons inside section after calendar header
const cells = sec.locator("button.min-w-0");
const n = await cells.count();
let clicked = 0;
for (let i = 0; i < n && clicked < 2; i++) {
  const cls = await cells.nth(i).getAttribute("class");
  if (cls && cls.includes("bg-white")) { await cells.nth(i).click(); clicked++; await p.waitForTimeout(250); }
}
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/shot-merge.png`, fullPage: false });
// addons section
const add = p.locator("section", { hasText: "Додайте до свята" });
await add.scrollIntoViewIfNeeded();
// enable photographer and bump hours
await add.locator("div", { hasText: "Професійний фотограф" }).locator("button", { hasText: "Додати" }).first().click().catch(()=>{});
await p.waitForTimeout(400);
await add.screenshot({ path: `${OUT}/shot-addons.png` });
await b.close(); console.log("ok");
