// Запуск Next з коректними host/port.
// Панелі хостингів передають HOST по-різному: "127.1.9.209", "0.0.0.0",
// а Хостинг Україна — повним URL "http://127.1.9.209:3000". Next очікує
// лише адресу, інакше падає з ENOTFOUND. Тут значення нормалізується.
const { spawn } = require("child_process");

function cleanHost(raw) {
  if (!raw) return "0.0.0.0";
  let s = String(raw).trim();
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ""); // прибрати http://
  s = s.replace(/\/.*$/, ""); // прибрати шлях
  const ipv6 = s.match(/^\[(.+)\]/); // [::1]:3000
  if (ipv6) return ipv6[1];
  s = s.replace(/:\d+$/, ""); // прибрати :порт
  return s || "0.0.0.0";
}

function cleanPort(raw, fallbackFromHost) {
  const fromEnv = String(raw ?? "").match(/\d+/);
  if (fromEnv) return fromEnv[0];
  const fromHost = String(fallbackFromHost ?? "").match(/:(\d+)/);
  if (fromHost) return fromHost[1];
  return "3000";
}

const host = cleanHost(process.env.HOST);
const port = cleanPort(process.env.PORT, process.env.HOST);
console.log(`Starting Next on ${host}:${port}`);

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
