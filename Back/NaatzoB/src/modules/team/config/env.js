// src/config/env.js
//
// Lee y valida las variables de entorno con Zod. Si algo falta o esta mal,
// el servidor se detiene al arrancar con un mensaje claro, no a mitad de la demo.
// Es el unico lugar donde se carga dotenv.

const mainEnv = require('../../../config/env');
const crypto = require('crypto');
const { z } = require("zod");

// Mensajes de validacion de Zod en espanol en todo el proyecto.
z.config(z.locales.es());

const bool = (def) =>
  z
    .enum(["true", "false"], { message: "Debe ser true o false" })
    .default(def)
    .transform((v) => v === "true");

const schema = z.object({
  // Servidor
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET debe tener al menos 16 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Base de datos
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DATABASE_SSL: bool("true"),
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, "DB_SCHEMA solo admite minusculas, numeros y guion bajo")
    .refine(value => value !== 'public', 'El módulo de equipos requiere un esquema distinto de public')
    .default("naatzo_team"),

  // Modelos
  LLM_PROVIDER: z.enum(["gemini", "ollama", "mock"]).default("gemini"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:8b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL_FAST: z.string().default("gemini-2.5-flash"),
  LLM_MODEL_SMART: z.string().default("gemini-2.5-flash"),
  DEVOPS_AGENT_MODE: z.enum(["off", "antigravity"]).default("off"),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_OWNER_TYPE: z.enum(["org", "user"]).default("org"),

  // Avisos por correo (SMTP). Sin SMTP_HOST, los avisos quedan en el historial.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Otros
  RISK_CHECK_CRON: z.string().default("*/10 * * * *"),
  DEMO_MODE: bool("false"),
});

// dotenv deja "" en las variables vacias (GITHUB_TOKEN=). Las tratamos como
// no definidas para que apliquen los defaults y los .optional().
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ""),
);
if (process.env.TEAM_DATABASE_URL && process.env.TEAM_DATABASE_URL !== mainEnv.databaseUrl) {
  throw new Error('Las cuentas compartidas requieren la misma DATABASE_URL para individual y equipos');
}
raw.DATABASE_URL = mainEnv.databaseUrl;
raw.DB_SCHEMA = process.env.TEAM_DB_SCHEMA || 'naatzo_team';
raw.API_PUBLIC_URL = process.env.API_PUBLIC_URL || `http://localhost:${mainEnv.port}`;
raw.JWT_SECRET = process.env.TEAM_JWT_SECRET || process.env.JWT_SECRET;
raw.SMTP_PASS = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
raw.SMTP_FROM = process.env.SMTP_FROM || process.env.EMAIL_FROM;
if (!raw.JWT_SECRET && mainEnv.nodeEnv !== 'production') {
  raw.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[team] JWT temporal de desarrollo: configura TEAM_JWT_SECRET para conservar sesiones al reiniciar.');
}

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error("[env] Configuracion invalida. Revisa tu archivo .env:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error('Configuración inválida del módulo de equipos');
}

const env = parsed.data;

// Sin llave de Gemini no hay forma de llamar al modelo: usamos el modo mock.
env.LLM_MOCK = env.LLM_PROVIDER === "mock" || (env.LLM_PROVIDER === "gemini" && !env.LLM_API_KEY);
if (env.LLM_PROVIDER === "gemini" && !env.LLM_API_KEY) {
  console.warn("[env] LLM_API_KEY vacia: se usa el modo mock del LLM.");
}

env.CORS_LIST = env.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

module.exports = env;
