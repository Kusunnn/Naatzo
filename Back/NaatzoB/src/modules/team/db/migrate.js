// src/db/migrate.js
//
// Aplica en orden los archivos .sql de migrations/ que todavia no se han
// corrido, en una transacción aislada compatible con poolers de Supabase.
// Uso: npm run migrate:team

const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const { pool } = require("./index");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function migrate() {
  await require('../../../repositories/userRepository').ensureUserTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`naatzo-migrations:${env.DB_SCHEMA}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${env.DB_SCHEMA}`);
    await client.query(`SET LOCAL search_path TO ${env.DB_SCHEMA}, pg_catalog`);
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
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        count++;
      } catch (err) {
        throw new Error(`Fallo la migracion ${file}: ${err.message}`);
      }
    }
    await client.query('COMMIT');
    console.log(
      count === 0
        ? "[migrate] La base ya estaba al dia"
        : `[migrate] ${count} migracion(es) aplicada(s) en el esquema ${env.DB_SCHEMA}`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => Promise.all([pool.end(), require('../../../db/postgres').close()]))
    .catch(async (err) => {
      console.error(`[migrate] ${err.message}`);
      await Promise.all([pool.end(), require('../../../db/postgres').close()]);
      process.exitCode = 1;
    });
}

module.exports = { migrate };
