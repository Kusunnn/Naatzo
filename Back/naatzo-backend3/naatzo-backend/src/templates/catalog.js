// src/templates/catalog.js
//
// Catalogo de plantillas que DevOps sabe generar, y la normalizacion del
// stack que escribe el Analista ("Node", "NodeJS" o "Express" -> node-express).
// Lo que no esta en el catalogo queda como "generic".

const CATALOG = {
  frontend: {
    "react-vite": { label: "React + Vite", aliases: ["react", "vite"] },
  },
  backend: {
    "node-express": { label: "Node + Express", aliases: ["node", "express"] },
  },
  database: {
    postgres: { label: "PostgreSQL", aliases: ["postgres", "psql", "supabase"] },
  },
};

// Palabras que, aunque contengan un alias, son otra tecnologia
// (por ejemplo "React Native" no es una app web con Vite).
const EXCLUDE = {
  frontend: ["native", "nextjs"],
  backend: ["nestjs"],
  database: [],
};

// Valores por defecto cuando la minuta no menciona una parte del stack.
const DEFAULTS = { backend: "node-express", database: "postgres" };

const PART_LABEL = { frontend: "el frontend", backend: "el backend", database: "la base de datos" };

function clean(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Regresa la clave del catalogo para un texto libre, o "generic". */
function normalizePart(part, value) {
  const text = clean(value);
  if (!text) return null;
  if (EXCLUDE[part].some((w) => text.includes(w))) return "generic";
  for (const [key, entry] of Object.entries(CATALOG[part])) {
    if (entry.aliases.some((a) => text.includes(a))) return key;
  }
  return "generic";
}

/**
 * Normaliza el stack del Analista. Regresa el stack con claves del catalogo,
 * el texto original (raw) y las dudas nuevas que hay que agregar.
 */
function normalizeStack(stack) {
  const result = { raw: { ...stack }, extras: (stack.extras || []).map((e) => e.toLowerCase()) };
  const questions = [];

  for (const part of ["frontend", "backend", "database"]) {
    const key = normalizePart(part, stack[part] || "");
    if (key === null && DEFAULTS[part]) {
      result[part] = DEFAULTS[part];
      questions.push(
        `No se menciona ${PART_LABEL[part]}; se usa ${label(part, DEFAULTS[part])} por defecto`,
      );
    } else if (key === "generic") {
      result[part] = "generic";
      questions.push(
        `"${stack[part]}" no tiene plantilla para ${PART_LABEL[part]}; se genera una estructura generica`,
      );
    } else {
      result[part] = key;
    }
  }
  return { stack: result, questions };
}

function label(part, key) {
  if (!key) return null;
  return CATALOG[part]?.[key]?.label || (key === "generic" ? "Generico" : key);
}

/** Texto corto del stack: "React + Vite, Node + Express, PostgreSQL". */
function describeStack(stack) {
  return ["frontend", "backend", "database"]
    .map((p) => (stack[p] === "generic" ? stack.raw?.[p] : label(p, stack[p])))
    .filter(Boolean)
    .join(", ");
}

module.exports = { CATALOG, normalizeStack, describeStack, label };
