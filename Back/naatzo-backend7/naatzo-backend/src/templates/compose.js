// src/templates/compose.js
//
// Arma el docker-compose.yml juntando piezas segun el stack y lo valida con
// js-yaml. Las imagenes llevan version fija: postgres:latest puede dejar de
// funcionar de un dia para otro (Postgres 18 cambio la ruta del volumen).

const yaml = require("js-yaml");

const POSTGRES_IMAGE = "postgres:16";

function buildCompose({ backend, frontend, database }) {
  const services = {};
  const volumes = {};

  if (backend) {
    services.api = {
      build: "./backend",
      ports: ["3000:3000"],
      env_file: ".env",
    };
    if (database) {
      services.api.depends_on = { db: { condition: "service_healthy" } };
    }
  }

  if (database) {
    services.db = {
      image: POSTGRES_IMAGE,
      environment: {
        POSTGRES_USER: "${DB_USER}",
        POSTGRES_PASSWORD: "${DB_PASSWORD}",
        POSTGRES_DB: "${DB_NAME}",
      },
      ports: ["5432:5432"],
      volumes: ["db_data:/var/lib/postgresql/data"],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"],
        interval: "5s",
        retries: 10,
      },
    };
    volumes.db_data = null;
  }

  if (frontend) {
    services.web = {
      build: { context: "./frontend", args: { VITE_API_URL: "http://localhost:3000" } },
      ports: ["5173:80"],
    };
    if (backend) services.web.depends_on = ["api"];
  }

  if (Object.keys(services).length === 0) return null;

  const doc = { services };
  if (Object.keys(volumes).length > 0) doc.volumes = volumes;
  const text = yaml
    .dump(doc, { lineWidth: 120, noRefs: true })
    .replace(/: null$/gm, ":")
    // Puertos entre comillas: en YAML 1.1 "3000:3000" sin comillas puede leerse como numero.
    .replace(/^(\s+)- (\d+:\d+)$/gm, '$1- "$2"');
  validateCompose(text);
  return text;
}

/** Revisa que el YAML sea valido y que ninguna imagen quede sin version fija. */
function validateCompose(text) {
  let doc;
  try {
    doc = yaml.load(text);
  } catch (err) {
    throw new Error(`El docker-compose.yml generado no es YAML valido: ${err.message}`);
  }
  if (!doc || typeof doc.services !== "object") {
    throw new Error("El docker-compose.yml generado no tiene servicios");
  }
  for (const [name, svc] of Object.entries(doc.services)) {
    if (!svc.image && !svc.build) throw new Error(`El servicio ${name} no tiene image ni build`);
    if (svc.image && (!svc.image.includes(":") || svc.image.endsWith(":latest"))) {
      throw new Error(`El servicio ${name} usa una imagen sin version fija (${svc.image})`);
    }
  }
  return doc;
}

module.exports = { buildCompose, validateCompose, POSTGRES_IMAGE };
