import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-Lasertag/57226a4d-0325-5c16-8408-d28f15db07df/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1360, height: 1200 } })).newPage();
await p.goto("http://localhost:3123/", { waitUntil: "networkidle" });
await p.selectOption("select", { label: "ТРЦ Gorodok" });
await p.waitForTimeout(900);
const sec = p.locator("section", { hasText: "Комплексні пропозиції" });
await sec.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await sec.screenshot({ path: `${OUT}/shot-pkg2-collapsed.png` });
// open Старт times
await p.getByRole("button", { name: /Обрати комплекс/ }).first().click();
await p.waitForTimeout(400);
await sec.screenshot({ path: `${OUT}/shot-pkg2-times.png` });
await b.close(); console.log("ok");
