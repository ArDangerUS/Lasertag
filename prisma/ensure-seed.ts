// Boot helper for hosting with an ephemeral filesystem (Heroku dynos):
// creates the schema and seeds ONLY when the database is empty, so a
// restart doesn't wipe data that already exists in a persistent DB.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let users = 0;
  try {
    users = await prisma.user.count();
  } catch {
    // table doesn't exist yet — treat as empty
  }
  if (users > 0) {
    console.log("DB already has data — skipping seed.");
    return;
  }
  console.log("Empty database — running seed…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
