// src/templates/index.js
//
// Arma todos los archivos del entorno desde plantillas. El LLM solo aporta el
// texto del README (descripcion, arquitectura y modulos); los comandos,
// puertos, Dockerfiles y el compose salen de aqui.

const nodeExpress = require("./node-express");
const reactVite = require("./react-vite");
const { buildCompose } = require("./compose");
const { label } = require("./catalog");

const PRIORITY_LABEL = { high: "Alta", medium: "Media", low: "Baja" };

function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proyecto"
  );
}

/** Carpeta para una parte sin plantilla: solo un README que lo explica. */
function genericPart(folder, part, rawName) {
  return {
    path: `${folder}/README.md`,
    content:
      `# ${part}\n\n` +
      `La minuta pide **${rawName}**, que todavía no tiene plantilla en Naatzo.\n` +
      "Esta carpeta queda lista para que el equipo agregue la estructura a mano.\n" +
      "No se incluye en docker-compose.yml.\n",
  };
}

function envExample({ slug, withDatabase }) {
  const lines = ["# Copia este archivo a .env y ajusta los valores", "PORT=3000", "CORS_ORIGIN=http://localhost:5173"];
  if (withDatabase) {
    const db = slug.replace(/-/g, "_");
    lines.push(
      "",
      "# Base de datos (los usa docker-compose y el backend)",
      "DB_USER=app",
      "DB_PASSWORD=cambia-esta-contrasena",
      `DB_NAME=${db}`,
      `DATABASE_URL=postgres://app:cambia-esta-contrasena@db:5432/${db}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const GITIGNORE = `node_modules/
dist/
.env
*.log
.DS_Store
`;

function tareasMd(projectName, modules) {
  const out = [`# Tareas de ${projectName}`, "", "Plan generado por Naatzo. El tablero en vivo está en Naatzo.", ""];
  for (const mod of modules) {
    out.push(`## ${mod.name}`, "", "| Tarea | Responsable | Prioridad | Horas | Inicio | Fin |", "|---|---|---|---|---|---|");
    for (const t of mod.tasks) {
      out.push(
        `| ${t.title.replace(/\|/g, "/")} | ${t.assignee || "Sin asignar"} | ${PRIORITY_LABEL[t.priority] || t.priority} | ${t.estimateHours} | ${t.plannedStart || "-"} | ${t.plannedEnd || "-"} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}

function readme({ projectName, stack, parts, text, compose }) {
  const stackLines = [];
  if (stack.frontend) stackLines.push(`- Frontend: ${stackName(stack, "frontend")} (\`frontend/\`)`);
  if (stack.backend) stackLines.push(`- Backend: ${stackName(stack, "backend")} (\`backend/\`)`);
  if (stack.database) stackLines.push(`- Base de datos: ${stackName(stack, "database")}${parts.database ? " 16" : ""}`);
  if (stack.extras?.length) stackLines.push(`- Extras: ${stack.extras.join(", ")}`);

  const ports = [];
  if (parts.frontend) ports.push("| Frontend | http://localhost:5173 |");
  if (parts.backend) ports.push("| API | http://localhost:3000/health |");
  if (parts.database && parts.backend) ports.push("| PostgreSQL | localhost:5432 |");

  const tree = [".", "├── docker-compose.yml", "├── .env.example", "├── docs/", "│   └── TAREAS.md"];
  if (stack.backend) tree.push("├── backend/");
  if (stack.frontend) tree.push("├── frontend/");
  tree.push("└── README.md");

  const run = compose
    ? ["```bash", "cp .env.example .env", "docker compose up --build", "```"]
    : ["Este stack todavía no tiene servicios en Docker; revisa el README de cada carpeta."];

  return [
    `# ${projectName}`,
    "",
    text.description,
    "",
    "## Stack",
    "",
    ...stackLines,
    "",
    "## Arquitectura",
    "",
    text.architecture,
    "",
    "## Módulos",
    "",
    ...text.modules.map((m) => `- **${m.name}**: ${m.summary}`),
    "",
    "## Requisitos",
    "",
    "- Docker y Docker Compose",
    ...(parts.frontend || parts.backend ? ["- Node 20 (solo para desarrollo sin Docker)"] : []),
    "",
    "## Cómo levantarlo",
    "",
    ...run,
    "",
    ...(ports.length ? ["## Puertos", "", "| Servicio | Dirección |", "|---|---|", ...ports, ""] : []),
    "## Estructura de carpetas",
    "",
    "```",
    ...tree,
    "```",
    "",
    "## Tareas",
    "",
    "El plan con responsables y fechas está en [docs/TAREAS.md](docs/TAREAS.md).",
    "",
    "---",
    "Estructura inicial generada por Naatzo.",
    "",
  ].join("\n");
}

function stackName(stack, part) {
  return stack[part] === "generic" ? stack.raw?.[part] || "Generico" : label(part, stack[part]);
}

/**
 * @param {object} p
 * @param {string} p.projectName
 * @param {string} p.slug
 * @param {object} p.stack    stack normalizado por el Analista
 * @param {Array}  p.modules  modulos con tareas (de la base)
 * @param {object} p.readmeText  { description, architecture, modules: [{name, summary}] }
 */
function buildFiles({ projectName, slug, stack, modules, readmeText }) {
  // Partes con plantilla real (las "generic" solo llevan un README).
  const parts = {
    backend: stack.backend === "node-express",
    frontend: stack.frontend === "react-vite",
    database: stack.database === "postgres",
  };
  const files = [];

  if (parts.backend) files.push(...nodeExpress.files({ slug, withDatabase: parts.database }));
  else if (stack.backend) files.push(genericPart("backend", "Backend", stack.raw?.backend || stack.backend));

  if (parts.frontend) files.push(...reactVite.files({ slug, projectName, withBackend: parts.backend }));
  else if (stack.frontend) files.push(genericPart("frontend", "Frontend", stack.raw?.frontend || stack.frontend));

  // La base solo entra al compose si hay backend que la use.
  const compose = buildCompose({
    backend: parts.backend,
    frontend: parts.frontend,
    database: parts.database && parts.backend,
  });
  if (compose) files.push({ path: "docker-compose.yml", content: compose });

  files.push(
    { path: ".env.example", content: envExample({ slug, withDatabase: parts.database && parts.backend }) },
    { path: ".gitignore", content: GITIGNORE },
    { path: "docs/TAREAS.md", content: tareasMd(projectName, modules) },
    { path: "README.md", content: readme({ projectName, stack, parts, text: readmeText, compose }) },
  );
  return files;
}

module.exports = { buildFiles, slugify };
