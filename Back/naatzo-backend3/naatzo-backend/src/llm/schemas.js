// src/llm/schemas.js
//
// Por cada salida del LLM hay dos esquemas que dicen lo mismo:
//   - el de Zod, con el que validamos (manda)
//   - el responseSchema de Gemini (subconjunto de OpenAPI), para que el
//     modelo genere JSON con esa forma desde el principio

const { z } = require("zod");

const S = { type: "STRING" };
const nullableS = { type: "STRING", nullable: true };
const arrayOf = (items) => ({ type: "ARRAY", items });
const object = (properties, required = Object.keys(properties)) => ({
  type: "OBJECT",
  properties,
  required,
  propertyOrdering: Object.keys(properties),
});

// ─── Analista (seccion 5.1) ─────────────────────────────────────────────────
const AnalysisSchema = z.object({
  objective: z.string().min(5),
  stack: z.object({
    frontend: z.string().nullable(),
    backend: z.string().nullable(),
    database: z.string().nullable(),
    extras: z.array(z.string()).default([]),
  }),
  requirements: z.array(z.string()).max(40),
  mentionedTasks: z.array(z.object({ title: z.string(), mentionedOwner: z.string().nullable() })),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), "Fecha inexistente")
    .nullable(),
  openQuestions: z.array(z.string()),
});

const AnalysisGemini = object({
  objective: { ...S, description: "Objetivo del proyecto en una frase" },
  stack: object({
    frontend: nullableS,
    backend: nullableS,
    database: nullableS,
    extras: arrayOf(S),
  }),
  requirements: { ...arrayOf(S), maxItems: 40 },
  mentionedTasks: arrayOf(object({ title: S, mentionedOwner: nullableS })),
  deadline: { ...nullableS, description: "Fecha de entrega en formato AAAA-MM-DD, o null" },
  openQuestions: arrayOf(S),
});

// ─── Planificador (seccion 5.2) ─────────────────────────────────────────────
// El LLM solo desglosa y estima. Responsables y fechas los pone el codigo.
const MAX_TASKS = 30;

const PlanTaskSchema = z.object({
  key: z.string().trim().min(1).max(12),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(500).default(""),
  skill: z.string().trim().min(1).max(40),
  estimateHours: z.number().min(1).max(16),
  priority: z.enum(["high", "medium", "low"]),
  dependsOn: z.array(z.string()).default([]),
  mentionedOwner: z.string().nullable().default(null),
});

const PlanSchema = z
  .object({
    modules: z
      .array(z.object({ name: z.string().trim().min(2).max(80), tasks: z.array(PlanTaskSchema).min(1) }))
      .min(1)
      .max(10),
  })
  .superRefine((plan, ctx) => {
    const tasks = plan.modules.flatMap((m) => m.tasks);
    if (tasks.length > MAX_TASKS) {
      ctx.addIssue({ code: "custom", message: `Maximo ${MAX_TASKS} tareas en total (hay ${tasks.length})` });
    }
    const keys = tasks.map((t) => t.key);
    const repeated = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (repeated.length > 0) {
      ctx.addIssue({ code: "custom", message: `Claves de tarea repetidas: ${[...new Set(repeated)].join(", ")}` });
    }
  });

/** El responseSchema limita la habilidad a las que tiene el equipo. */
function planGemini(skills) {
  const skill = skills.length > 0 ? { type: "STRING", format: "enum", enum: skills } : S;
  return object({
    modules: {
      ...arrayOf(
        object({
          name: S,
          tasks: arrayOf(
            object({
              key: { ...S, description: "Clave corta y unica, por ejemplo T1" },
              title: S,
              description: S,
              skill,
              estimateHours: { type: "NUMBER", minimum: 1, maximum: 16 },
              priority: { type: "STRING", format: "enum", enum: ["high", "medium", "low"] },
              dependsOn: { ...arrayOf(S), description: "Claves de las tareas de las que depende" },
              mentionedOwner: nullableS,
            }),
          ),
        }),
      ),
      maxItems: 10,
    },
  });
}

// Explicacion del plan: el LLM solo redacta a partir de lo que calculo el codigo.
const ExplanationSchema = z.object({ explanation: z.string().trim().min(10).max(800) });
const ExplanationGemini = object({ explanation: S });

// ─── DevOps: texto del README (seccion 5.3) ─────────────────────────────────
// El LLM solo redacta texto. Comandos, puertos y Dockerfiles salen de plantillas.
const ReadmeSchema = z.object({
  description: z.string().trim().min(20).max(800),
  architecture: z.string().trim().min(20).max(1500),
  modules: z
    .array(z.object({ name: z.string().trim().min(1).max(80), summary: z.string().trim().min(5).max(300) }))
    .max(10),
});
const ReadmeGemini = object({
  description: { ...S, description: "2 a 4 oraciones sobre que hace el proyecto y para quien" },
  architecture: { ...S, description: "Un parrafo que explique como se conectan las partes del stack" },
  modules: arrayOf(object({ name: S, summary: S })),
});

// ─── Replanificacion (seccion 5.2) ──────────────────────────────────────────
// El LLM solo traduce el aviso ("Ana no puede esta semana") a cambios. Quien
// pasa a quien y las fechas nuevas los calcula el codigo.
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Fecha inexistente");

const REPLAN_TYPES = ["unavailable", "weekly_hours", "deadline", "deadline_shift"];
const REQUIRED_BY_TYPE = {
  unavailable: ["member", "startDate", "endDate"],
  weekly_hours: ["member", "weeklyHours"],
  deadline: ["date"],
  deadline_shift: ["days"],
};

const ReplanChangeSchema = z
  .object({
    type: z.enum(REPLAN_TYPES),
    member: z.string().trim().min(1).nullable().default(null),
    startDate: isoDay.nullable().default(null),
    endDate: isoDay.nullable().default(null),
    weeklyHours: z.number().positive().max(80).nullable().default(null),
    date: isoDay.nullable().default(null),
    days: z.number().int().min(-365).max(365).nullable().default(null),
    reason: z.string().trim().max(200).nullable().default(null),
  })
  .superRefine((c, ctx) => {
    for (const field of REQUIRED_BY_TYPE[c.type]) {
      if (c[field] === null) ctx.addIssue({ code: "custom", path: [field], message: `Falta ${field} para ${c.type}` });
    }
    if (c.startDate && c.endDate && c.endDate < c.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate no puede ser antes de startDate" });
    }
  });

const ReplanSchema = z.object({
  understood: z.string().trim().min(5).max(400),
  changes: z.array(ReplanChangeSchema).max(10),
});

/** El miembro solo puede ser alguien del equipo. */
function replanGemini(memberNames) {
  const member = memberNames.length > 0 ? { type: "STRING", format: "enum", enum: memberNames, nullable: true } : nullableS;
  return object({
    understood: { ...S, description: "Una frase con lo que se entendio del aviso" },
    changes: {
      ...arrayOf(
        object({
          type: { type: "STRING", format: "enum", enum: REPLAN_TYPES },
          member,
          startDate: { ...nullableS, description: "AAAA-MM-DD, solo para unavailable" },
          endDate: { ...nullableS, description: "AAAA-MM-DD, solo para unavailable" },
          weeklyHours: { type: "NUMBER", nullable: true, description: "Solo para weekly_hours" },
          date: { ...nullableS, description: "Nueva entrega AAAA-MM-DD, solo para deadline" },
          days: { type: "INTEGER", nullable: true, description: "Solo para deadline_shift: negativo adelanta, positivo retrasa" },
          reason: nullableS,
        }),
      ),
      maxItems: 10,
    },
  });
}

// ─── Notificador (seccion 5.4) ──────────────────────────────────────────────
// El LLM solo redacta un resumen corto; los links y las fechas los pone el codigo.
const NotifySchema = z.object({ summary: z.string().trim().min(10).max(400) });
const NotifyGemini = object({ summary: { ...S, description: "Resumen de 2 o 3 lineas, sin links" } });

module.exports = {
  ReplanSchema,
  replanGemini,
  NotifySchema,
  NotifyGemini,
  ReadmeSchema,
  ReadmeGemini,
  AnalysisSchema,
  AnalysisGemini,
  PlanSchema,
  planGemini,
  MAX_TASKS,
  ExplanationSchema,
  ExplanationGemini,
  // ayudantes para los esquemas de los demas agentes
  gemini: { S, nullableS, arrayOf, object },
};
