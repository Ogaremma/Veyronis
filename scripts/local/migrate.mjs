import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:55432/veyronis";
const pool = new pg.Pool({ connectionString });
try {
  for (const migration of ["001_create_agreements.sql", "002_create_agreement_reconciliations.sql"]) {
    await pool.query(await readFile(`backend/sql/${migration}`, "utf8"));
    console.log(`Applied ${migration}`);
  }
} finally {
  await pool.end();
}
