// Обирає провайдер бази за DATABASE_URL: postgres://... -> postgresql,
// інакше sqlite. Викликається перед prisma generate / db push, тож одна
// й та сама схема працює локально (SQLite) і на Heroku (Heroku Postgres
// сам задає DATABASE_URL).
const fs = require("fs");

const SCHEMA = "prisma/schema.prisma";
const url = process.env.DATABASE_URL || "";
const want = url.startsWith("postgres") ? "postgresql" : "sqlite";

let src = fs.readFileSync(SCHEMA, "utf8");
const m = src.match(/provider\s*=\s*"(sqlite|postgresql)"/);
if (!m) {
  console.error("db-provider: datasource provider not found in schema.prisma");
  process.exit(1);
}
if (m[1] !== want) {
  src = src.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${want}"`);
  fs.writeFileSync(SCHEMA, src);
  console.log(`db-provider: datasource -> ${want}`);
}
