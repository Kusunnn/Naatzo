// src/llm/mock.js
//
// Respuestas fijas del LLM para la minuta de ejemplo (src/demo/sample.js).
// Se usan con LLM_PROVIDER=mock, cuando no hay llave, y como respaldo en la
// demo si Gemini no responde. Pasan por la misma validacion Zod que las reales.

const { addDays } = require("../planning/dates");

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

// Replanificacion sin LLM: entiende las frases tipicas de la demo con palabras
// clave ("Ana no puede esta semana", "Luis ahora solo tiene 4 horas",
// "el cliente adelanto la entrega 5 dias"). Con Gemini esto lo hace el modelo.
responses.replan = ({ event = "", members = [], today }) => {
  const text = event
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const plain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const member = members.find((name) => new RegExp(`\\b${plain(name)}\\b`).test(text)) || null;
  const WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20 };
  const word = text.match(new RegExp(`\\b(${Object.keys(WORDS).join("|")})\\b`));
  const number = Number((text.match(/(\d+)/) || [])[1]) || (word ? WORDS[word[1]] : null);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 domingo ... 6 sabado
  const changes = [];

  if (/(adelant|antes)/.test(text) && /entrega/.test(text) && number) {
    const days = /semana/.test(text) ? number * 7 : number;
    changes.push({ type: "deadline_shift", days: -days, reason: event });
  } else if (/(retras|pospon|recorr|extiend|\bmas\b|despues)/.test(text) && /entrega/.test(text) && number) {
    const days = /semana/.test(text) ? number * 7 : number;
    changes.push({ type: "deadline_shift", days, reason: event });
  }

  if (member && /hora/.test(text) && number && !/entrega/.test(text)) {
    changes.push({ type: "weekly_hours", member, weeklyHours: number, reason: event });
  } else if (member && /(no puede|no podra|enferm|vacacion|ausent|no va a estar|no estara|fuera|falta)/.test(text)) {
    let startDate = today;
    let endDate;
    if (/(proxima|siguiente) semana/.test(text)) {
      startDate = addDays(today, ((8 - dow) % 7) || 7); // lunes siguiente
      endDate = addDays(startDate, 4);
    } else if (/manana/.test(text)) {
      startDate = addDays(today, 1);
      endDate = startDate;
    } else if (number && /dia/.test(text)) {
      endDate = addDays(today, number - 1);
    } else {
      // "esta semana" o sin periodo: de hoy al viernes (o la semana que viene si es fin de semana)
      if (dow === 0 || dow === 6) startDate = addDays(today, dow === 6 ? 2 : 1);
      endDate = addDays(startDate, 5 - new Date(`${startDate}T00:00:00Z`).getUTCDay());
    }
    changes.push({ type: "unavailable", member, startDate, endDate, reason: event });
  }

  const describe = (c) =>
    c.type === "unavailable"
      ? `${c.member} no esta del ${c.startDate} al ${c.endDate}`
      : c.type === "weekly_hours"
        ? `${c.member} pasa a ${c.weeklyHours} horas por semana`
        : `la entrega se mueve ${c.days} dias`;
  return {
    understood: changes.length ? `Entendido: ${changes.map(describe).join("; ")}.` : "No identifique un cambio aplicable en el aviso.",
    changes,
  };
};

responses.replanExplanation = (facts) => {
  const parts = [`${facts.understood}`];
  if (facts.moved?.length) {
    parts.push(`Se reasignaron ${facts.moved.length} tarea(s): ${facts.moved.map((m) => `"${m.title}" de ${m.from} a ${m.to}`).join("; ")}.`);
  } else {
    parts.push("Nadie cambia de tareas.");
  }
  if (facts.finishBefore !== facts.finishAfter) {
    parts.push(`El plan pasa de terminar el ${facts.finishBefore} a terminar el ${facts.finishAfter}.`);
  }
  if (facts.deadlineAfter && facts.finishAfter > facts.deadlineAfter) {
    parts.push(`Sigue despues de la entrega del ${facts.deadlineAfter}.`);
  }
  return { explanation: parts.join(" ") };
};

function task(key, title, skill, estimateHours, priority, dependsOn, mentionedOwner) {
  return { key, title, description: "", skill, estimateHours, priority, dependsOn, mentionedOwner,
    acceptanceCriteria: [`Se demuestra el resultado de: ${title}.`, "Las pruebas del caso principal y de un caso de error pasan."] };
}

function has(key) {
  return Boolean(responses[key]);
}

function get(key, input) {
  if (!responses[key]) throw new Error(`No hay respuesta mock para "${key}"`);
  return responses[key](input || {});
}

module.exports = { has, get };
