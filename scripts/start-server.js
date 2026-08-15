// Запуск Next з коректними host/port, У ЦЬОМУ Ж ПРОЦЕСІ.
//
// Панелі хостингів передають HOST по-різному: "127.1.9.209", "0.0.0.0",
// а Хостинг Україна — повним URL "http://127.1.9.209:3000". Next очікує
// лише адресу, інакше падає з ENOTFOUND. Тут значення нормалізується.
//
// Важливо: Next запускається через require, а не окремим процесом. Якщо
// породжувати дочірній процес, Supervisor при перезапуску вбиває тільки
// батька — Next лишається «сиротою», тримає порт, і кожен наступний старт
// падає з EADDRINUSE.

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

// Сторож: якщо Supervisor убʼє батьківський процес, наш Next лишиться
// «сиротою» і триматиме порт — наступний старт впаде з EADDRINUSE.
// Помітивши зміну батька (ppid стає 1), завершуємось самі.
const parentPid = process.ppid;
setInterval(() => {
  if (process.ppid !== parentPid) {
    console.log("Parent process is gone - shutting down to free the port");
    process.exit(0);
  }
}, 3000).unref();

const host = cleanHost(process.env.HOST);
const port = cleanPort(process.env.PORT, process.env.HOST);
console.log(`Starting Next on ${host}:${port}`);

// Next CLI читає process.argv — підміняємо і віддаємо йому керування.
const nextBin = require.resolve("next/dist/bin/next");
process.argv = [process.argv[0], nextBin, "start", "-H", host, "-p", port];
require(nextBin);
