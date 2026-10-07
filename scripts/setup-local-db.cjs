// Run from any directory: node scripts/setup-local-db.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('../Back/NaatzoB/node_modules/pg');
const bcrypt = require('../NaatzoE/node_modules/bcryptjs');
const { hashPassword } = require('../Back/NaatzoB/src/utils/password');

const root = path.resolve(__dirname, '..');
const dotenv = require('../Back/NaatzoB/node_modules/dotenv');
const env = dotenv.parse(fs.readFileSync(path.join(root, 'Back/NaatzoB/.env')));
const url = new URL(process.env.LOCAL_DATABASE_URL || env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/naatzo_local') {
  throw new Error('Este script solo prepara PostgreSQL local con la base naatzo_local.');
}

async function main() {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.href, ssl: false });
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'naatzo_local'");
    if (!exists.rowCount) await admin.query('CREATE DATABASE naatzo_local');
  } finally {
    await admin.end();
  }
  const db = new Pool({ connectionString: url.href, ssl: false });
  try {
    // Explicit list: never execute the optional destructive cleanup migration.
    for (const file of [
      'Back/NaatzoB/migrations/2026_10_07_naatzo_branding.sql',
      'NaatzoE/database.example.sql',
      'NaatzoE/migrations/2026_05_11_batch1.sql',
      'NaatzoE/migrations/2026_05_11_users_tasks.sql',
    ]) await db.query(fs.readFileSync(path.join(root, file), 'utf8'));

    await db.query(`CREATE TABLE IF NOT EXISTS public.naatzo_users (
      id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE UNIQUE INDEX IF NOT EXISTS naatzo_users_email_lower_idx
      ON public.naatzo_users (LOWER(email));`);
    const existing = await db.query("SELECT id FROM public.naatzo_users WHERE LOWER(email) = 'test@test.com'");
    const id = existing.rows[0]?.id || crypto.randomUUID();
    await db.query(`INSERT INTO public.naatzo_users (id, name, email, password_hash)
      VALUES ($1, 'Usuario de prueba', 'test@test.com', $2)
      ON CONFLICT (LOWER(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash,
      updated_at = NOW()`, [id, hashPassword('12345')]);
    await db.query(`INSERT INTO public.users (id, name, email, password_hash)
      VALUES ($1, 'Usuario de prueba', 'test@test.com', $2)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
      updated_at = NOW()`, [id, await bcrypt.hash('12345', 10)]);
    console.log('Base local lista: naatzo_local. Login: test@test.com / 12345');
  } finally {
    await db.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
