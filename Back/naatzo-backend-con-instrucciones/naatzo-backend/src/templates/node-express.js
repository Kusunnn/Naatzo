// src/templates/node-express.js
// Plantilla probada de backend: Express con ruta /health y conexion a Postgres.
// Versiones fijas para que el proyecto generado no cambie de un dia a otro.

function files({ slug, withDatabase }) {
  const pkg = {
    name: `${slug}-backend`,
    version: "0.1.0",
    private: true,
    main: "src/index.js",
    scripts: { start: "node src/index.js", dev: "node --watch src/index.js" },
    engines: { node: ">=20" },
    dependencies: withDatabase ? { express: "4.21.2", pg: "8.13.1" } : { express: "4.21.2" },
  };

  const dbBlock = withDatabase
    ? `const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get("/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "conectada" });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
`
    : "";

  const index = `// Punto de entrada del backend.
const express = require("express");

const app = express();
app.use(express.json());

// Permite que el frontend local consulte la API.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "${slug}-backend" });
});
${dbBlock ? `\n${dbBlock}` : ""}
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(\`API escuchando en el puerto \${port}\`);
});
`;

  // npm install --omit=dev y no npm ci: el proyecto todavia no trae package-lock.json.
  const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/index.js"]
`;

  return [
    { path: "backend/package.json", content: `${JSON.stringify(pkg, null, 2)}\n` },
    { path: "backend/src/index.js", content: index },
    { path: "backend/Dockerfile", content: dockerfile },
    { path: "backend/.dockerignore", content: "node_modules\nnpm-debug.log\n.env\n" },
  ];
}

module.exports = { files };
