// src/llm/mock.js
//
// Respuestas fijas del LLM para la minuta de ejemplo (src/demo/sample.js).
// Se usan con LLM_PROVIDER=mock, cuando no hay llave, y como respaldo en la
// demo si Gemini no responde. Pasan por la misma validacion Zod que las reales.

const responses = {
  analyst: () => ({
    objective: "App web para reservar las canchas deportivas del tecnologico",
    stack: {
      frontend: "React con Vite",
      backend: "Node con Express",
      database: "Postgres",
      extras: ["docker"],
    },
    requirements: [
      "Registro e inicio de sesion con correo institucional",
      "Calendario de disponibilidad por cancha en bloques de 1 hora, de 7 a 21",
      "Reservar un bloque disponible",
      "Maximo 2 reservas activas por alumno",
      "Panel del administrador para bloquear horarios por torneos o mantenimiento",
      "Correo de confirmacion al reservar (opcional)",
      "Reporte de uso por cancha al final del semestre (no urgente)",
      "Todo el sistema se levanta con Docker en el servidor de la escuela",
    ],
    mentionedTasks: [
      { title: "Disenar las pantallas de reserva y el panel de administrador", mentionedOwner: "Laura" },
      { title: "Configurar Docker y el despliegue", mentionedOwner: "Diego" },
      { title: "Backend en Node con Express y Postgres", mentionedOwner: "Luis" },
      { title: "Frontend en React con Vite", mentionedOwner: "Ana" },
    ],
    deadline: "2026-11-20",
    openQuestions: [
      "No se confirma el dominio del correo institucional (@tec.mx)",
      "No se sabe si hay que usar el login de la escuela (SSO) o uno propio",
    ],
  }),

  planner: () => ({
    modules: [
      {
        name: "Base y despliegue",
        tasks: [
          task("T1", "Configurar el repositorio y Docker Compose", "devops", 4, "high", [], "Diego"),
          task("T2", "Despliegue en el servidor de la escuela", "devops", 6, "medium", ["T1"], "Diego"),
        ],
      },
      {
        name: "Diseño",
        tasks: [
          task("T3", "Diseño de las pantallas de reserva", "diseno", 6, "high", [], "Laura"),
          task("T4", "Diseño del panel de administrador", "diseno", 5, "medium", [], "Laura"),
        ],
      },
      {
        name: "Autenticación",
        tasks: [
          task("T5", "Modelo de datos de usuarios, canchas y reservas", "backend", 6, "high", ["T1"], "Luis"),
          task("T6", "API de registro y login con correo institucional", "backend", 8, "high", ["T5"], "Luis"),
          task("T7", "Pantallas de registro e inicio de sesión", "frontend", 6, "high", ["T3", "T6"], "Ana"),
        ],
      },
      {
        name: "Reservas",
        tasks: [
          task("T8", "API de disponibilidad por cancha", "backend", 8, "high", ["T5"], "Luis"),
          task("T9", "API de reservas con límite de 2 activas", "backend", 10, "high", ["T6", "T8"], "Luis"),
          task("T10", "Calendario de disponibilidad por cancha", "frontend", 10, "high", ["T3", "T8"], "Ana"),
          task("T11", "Flujo de reserva en el frontend", "frontend", 8, "high", ["T9", "T10"], "Ana"),
        ],
      },
      {
        name: "Administración",
        tasks: [
          task("T12", "API para bloquear horarios", "backend", 6, "medium", ["T8"], "Luis"),
          task("T13", "Panel de administrador", "frontend", 8, "medium", ["T4", "T12"], null),
          task("T14", "Correo de confirmación de reserva", "backend", 4, "low", ["T9"], null),
          task("T15", "Reporte de uso por cancha", "backend", 6, "low", ["T9"], null),
        ],
      },
      {
        name: "Calidad",
        tasks: [
          task("T16", "Pruebas de punta a punta del flujo de reserva", "qa", 6, "medium", ["T11"], null),
          task("T17", "Pruebas del panel de administrador", "qa", 4, "low", ["T13"], null),
        ],
      },
    ],
  }),

  // La explicacion mock se arma con los datos que calculo el codigo.
  planExplanation: (facts) => {
    const parts = [];
    if (facts.overloaded?.length) {
      parts.push(
        `${facts.overloaded.map((o) => `${o.name} queda al ${o.percent}%`).join(" y ")} porque concentra las tareas de su especialidad.`,
      );
    }
    if (facts.finishDate && facts.deadline && facts.finishDate > facts.deadline) {
      parts.push(`Con la carga actual el plan termina el ${facts.finishDate}, despues de la entrega del ${facts.deadline}.`);
    }
    if (facts.proposals?.length) {
      parts.push(`Propuesta: ${facts.proposals.map((p) => p.message).join("; ")}.`);
    }
    return { explanation: parts.join(" ") || "El plan cabe en el tiempo disponible y nadie queda sobrecargado." };
  },
};

// El texto del README mock se arma con el objetivo y los modulos reales.
responses.readme = ({ objective, stackText, modules = [] }) => ({
  description: `${objective}. Este repositorio contiene la estructura inicial del proyecto, lista para que el equipo empiece a trabajar.`,
  architecture: `El proyecto usa ${stackText}. El frontend consume la API REST del backend, y el backend guarda los datos en la base. Todos los servicios se levantan juntos con Docker Compose.`,
  modules: modules.map((m) => ({
    name: m.name,
    summary: `${m.tasks.length} tarea(s): ${m.tasks.map((t) => t.title).slice(0, 3).join(", ")}${m.tasks.length > 3 ? "..." : ""}.`,
  })),
});

responses.notifySummary = ({ objective, plan = {} }) => ({
  summary:
    `${objective}. El plan reparte el trabajo segun la carga de cada quien` +
    (plan.atRisk ? " y tiene riesgos que conviene revisar antes de arrancar." : " y cabe en el tiempo disponible."),
});

function task(key, title, skill, estimateHours, priority, dependsOn, mentionedOwner) {
  return { key, title, description: "", skill, estimateHours, priority, dependsOn, mentionedOwner };
}

function has(key) {
  return Boolean(responses[key]);
}

function get(key, input) {
  if (!responses[key]) throw new Error(`No hay respuesta mock para "${key}"`);
  return responses[key](input || {});
}

module.exports = { has, get };
