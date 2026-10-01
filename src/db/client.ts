import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

let dbPromise: Promise<Database> | null = null;

/**
 * Neon (or any Postgres) when DATABASE_URL is set; otherwise an embedded PGlite database in
 * `.data/pglite` so the app runs locally with zero setup. PGlite is never used on Vercel.
 */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = createDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Test hook: inject a database (e.g. in-memory PGlite). */
export function setDb(db: Database | null) {
  dbPromise = db ? Promise.resolve(db) : null;
}

async function createDb(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5_000 });
    if (process.env.VERCEL) {
      const { attachDatabasePool } = await import("@vercel/functions");
      attachDatabasePool(pool);
    }
    return drizzle(pool, { schema }) as unknown as Database;
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Connect Neon from the Vercel Marketplace (Storage → Neon).");
  }
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  return createPgliteDb(dataDir);
}

/** Embedded Postgres (WASM) for local development and tests. `dataDir` undefined → in-memory. */
export async function createPgliteDb(dataDir?: string): Promise<Database> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Database;
}

export { schema };
