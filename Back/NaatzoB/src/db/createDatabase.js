const { Pool } = require('pg');

function createDatabase({ connectionString, ssl, schema }) {
  if (schema && !/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Esquema inválido');
  let pool;
  function getPool() {
    if (!connectionString) throw new Error('DATABASE_URL no está configurada');
    if (!pool) {
      pool = new Pool({ connectionString, ssl,
        max: Number(process.env.DB_POOL_MAX || 10),
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000) });
      pool.on('error', error => console.error('[db] Error en cliente idle:', error.message));
    }
    return pool;
  }
  async function withTransaction(fn) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // LOCAL funciona con poolers en modo transacción. Sin fallback a public:
      // una tabla faltante nunca debe leer datos del otro módulo.
      if (schema) await client.query(`SET LOCAL search_path TO ${schema}, pg_catalog`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  function query(text, params) {
    return schema ? withTransaction(client => client.query(text, params)) : getPool().query(text, params);
  }
  async function close() { if (pool) await pool.end(); }
  return { query, withTransaction, getPool, close, get pool() { return getPool(); } };
}
module.exports = { createDatabase };
