import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export async function createDatabasePool(databaseUrl: string): Promise<Pool> {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query("select 1");
  return pool;
}

export async function runMigrations(pool: Pool): Promise<void> {
  const dir = path.resolve("migrations");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) await pool.query(await readFile(path.join(dir, file), "utf8"));
}
