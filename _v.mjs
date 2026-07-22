import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-Lasertag/57226a4d-0325-5c16-8408-d28f15db07df/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1360, height: 1100 } })).newPage();
await p.goto("http://localhost:3124/", { waitUntil: "networkidle" });
// open date picker
await p.locator("button", { hasText: /^\d{2}\.\d{2}\.\d{4}/ }).first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/shot-datepicker.png`, clip: { x: 40, y: 150, width: 700, height: 620 } });
await p.keyboard.press("Escape");
// Gorodok -> Золотий standard on Нивки actually gold is at nyvky; use Нивки
await p.selectOption("select", { label: "Нивки G-75" });
await p.waitForTimeout(900);
const sec = p.locator("section", { hasText: "Комплексні пропозиції" });
await sec.scrollIntoViewIfNeeded();
// choose Золотий стандарт (2nd card) -> open times -> pick first
const goldChoose = sec.getByRole("button", { name: /Обрати комплекс/ }).nth(1);
await goldChoose.click();
await p.waitForTimeout(400);
await sec.screenshot({ path: `${OUT}/shot-gold-times.png` });
// pick first available time
const chip = sec.locator("button").filter({ hasText: /^\d{1,2}:\d{2}$/ }).first();
await chip.click();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/shot-gold-cart.png`, clip: { x: 950, y: 280, width: 400, height: 340 } });
await b.close(); console.log("ok");
