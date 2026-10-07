// src/db/index.js
// Pool de Postgres y transacciones (de KIBO 1).
const { Pool, types } = require("pg");
const env = require("../config/env");

// Las columnas DATE se quedan como texto "YYYY-MM-DD". Si pg las convierte a
// Date, la zona horaria del servidor puede mover el dia.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
});

// Si las tablas viven en un esquema aparte (por ejemplo "naatzo" en el
// Supabase de KIBO 1), cada conexion nueva lo pone primero en el search_path.
if (env.DB_SCHEMA !== "public") {
  pool.on("connect", (client) => {
    client.query(`SET search_path TO ${env.DB_SCHEMA}, public`).catch((err) => {
      console.error("[db] No se pudo fijar el search_path:", err.message);
    });
  });
}

pool.on("error", (err) => {
  console.error("[db] Error inesperado en cliente idle:", err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta `fn(client)` dentro de una transaccion.
 * Hace BEGIN; ejecuta; COMMIT. Si lanza, hace ROLLBACK.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignorar */
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  withTransaction,
  pool,
};
