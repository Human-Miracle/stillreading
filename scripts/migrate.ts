// Applies Drizzle migrations to DATABASE_URL (Neon) or the local PGlite database.
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Connect Neon via the Vercel Marketplace.");
    const { createPgliteDb } = await import("../src/db/client");
    await createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
    console.log("Migrated local PGlite database (.data/pglite)");
    return;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("Migrated database");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
