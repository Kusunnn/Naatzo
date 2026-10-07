// src/db/migrate.js
//
// Aplica en orden los archivos .sql de migrations/ que todavia no se han
// corrido. Cada archivo va en su propia transaccion y queda registrado en
// schema_migrations. Uso: npm run migrate

const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const { pool } = require("./index");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

async function migrate() {
  const client = await pool.connect();
  try {
    // El esquema se crea antes que nada; luego se vuelve a fijar el
    // search_path porque al conectar todavia no existia.
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${env.DB_SCHEMA}`);
    await client.query(`SET search_path TO ${env.DB_SCHEMA}, public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrate] Aplicando ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Fallo la migracion ${file}: ${err.message}`);
      }
    }
    console.log(
      count === 0
        ? "[migrate] La base ya estaba al dia"
        : `[migrate] ${count} migracion(es) aplicada(s) en el esquema ${env.DB_SCHEMA}`,
    );
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(`[migrate] ${err.message}`);
      pool.end();
      process.exit(1);
    });
}

module.exports = { migrate };
