// src/config/env.js
//
// Lee y valida las variables de entorno con Zod. Si algo falta o esta mal,
// el servidor se detiene al arrancar con un mensaje claro, no a mitad de la demo.
// Es el unico lugar donde se carga dotenv.

require("dotenv").config({ quiet: true });
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
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
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
    .default("public"),

  // Modelos
  LLM_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL_FAST: z.string().default("gemini-3.5-flash-lite"),
  LLM_MODEL_SMART: z.string().default("gemini-3.8-flash"),
  FALLBACK_PROVIDER: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEVOPS_AGENT_MODE: z.enum(["off", "antigravity"]).default("off"),
  GEMINI_AGENT_ID: z.string().optional(),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_OWNER_TYPE: z.enum(["org", "user"]).default("org"),

  // Jira (despues del MVP). El tablero es propio: no se usa Trello.
  JIRA_BASE_URL: z.string().optional(),
  JIRA_EMAIL: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),

  // Notificaciones
  DISCORD_WEBHOOK_URL: z
    .string()
    .url("DISCORD_WEBHOOK_URL debe ser una URL")
    .optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Otros
  ENCRYPTION_KEY: z.string().optional(),
  RISK_CHECK_CRON: z.string().default("*/10 * * * *"),
  DEMO_MODE: bool("false"),
  WORKSPACE_DIR: z.string().default("./workspace"),
});

// dotenv deja "" en las variables vacias (GITHUB_TOKEN=). Las tratamos como
// no definidas para que apliquen los defaults y los .optional().
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ""),
);

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error("[env] Configuracion invalida. Revisa tu archivo .env:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Sin llave de Gemini no hay forma de llamar al modelo: usamos el modo mock.
env.LLM_MOCK = env.LLM_PROVIDER === "mock" || !env.LLM_API_KEY;
if (env.LLM_PROVIDER === "gemini" && !env.LLM_API_KEY) {
  console.warn("[env] LLM_API_KEY vacia: se usa el modo mock del LLM.");
}

env.CORS_LIST = env.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

module.exports = env;
