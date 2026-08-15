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

// Якщо порт зайнятий — розбираємось, ким саме:
//  • там живий здоровий сервер → цей екземпляр зайвий, тихо виходимо
//    (інакше два екземпляри вбивали б один одного по колу, а Supervisor
//     піднімав би все нові);
//  • там мертвий/завислий процес → прибираємо його і стартуємо самі.
function portBusy(h, p) {
  const net = require("net");
  return new Promise((resolve) => {
    const srv = net
      .createServer()
      .once("error", (e) => resolve(e.code === "EADDRINUSE"))
      .once("listening", () => srv.close(() => resolve(false)))
      .listen(Number(p), h === "0.0.0.0" ? undefined : h);
  });
}

function serverAlive(h, p) {
  const http = require("http");
  const target = h === "0.0.0.0" ? "127.0.0.1" : h;
  return new Promise((resolve) => {
    const req = http.get({ host: target, port: Number(p), path: "/", timeout: 3000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensurePortFree(h, p) {
  let announced = false;
  // Панель може запускати кілька екземплярів (окремі налаштування сайту й
  // застосунку). Замість того щоб виходити (Supervisor одразу підняв би
  // новий — і так по колу), зайвий екземпляр стає РЕЗЕРВНИМ: чекає і
  // підхоплює роботу, якщо основний зникне.
  for (;;) {
    if (!(await portBusy(h, p))) return true;

    if (await serverAlive(h, p)) {
      if (!announced) {
        console.log(
          `Port ${p} is already served by another instance - standing by. ` +
            "Цей екземпляр підхопить роботу, якщо основний зупиниться."
        );
        announced = true;
      }
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    console.log(`Port ${p} is held by a dead process - clearing it`);
    try {
      require("child_process").execSync("pkill -f 'next-server' || true", { stdio: "ignore" });
    } catch {
      /* нічого не знайшли — не критично */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

ensurePortFree(host, port).then((free) => {
  if (free) start();
});

function start() {
console.log(`Starting Next on ${host}:${port}`);

// Next CLI читає process.argv — підміняємо і віддаємо йому керування.
const nextBin = require.resolve("next/dist/bin/next");
process.argv = [process.argv[0], nextBin, "start", "-H", host, "-p", port];
require(nextBin);
}
