// src/agents/devops.js
//
// DevOps (seccion 5.3). La regla mas importante del proyecto: el modelo no
// decide que comandos se ejecutan. Los archivos salen de plantillas probadas
// (src/templates/); el LLM solo redacta el texto del README.
// Si GitHub no esta configurado o falla, los archivos quedan para el ZIP.

const env = require("../config/env");
const db = require("../db");
const { generateStructured } = require("../llm/client");
const { ReadmeSchema, ReadmeGemini } = require("../llm/schemas");
const mock = require("../llm/mock");
const { buildFiles, slugify } = require("../templates");
const { describeStack } = require("../templates/catalog");
const github = require("../integrations/github");
const { zipUrl } = require("../orchestrator/inputs");

const README_SYSTEM = `Eres el agente DevOps de Naatzo. Redactas solo el texto del README de un proyecto nuevo:
una descripcion, la arquitectura explicada y un resumen por modulo.
Reglas:
- Escribe en espanol, claro y breve.
- No escribas comandos, bloques de codigo, puertos ni instrucciones de instalacion: eso lo agrega el sistema.
- Usa solo la informacion que te dan; no inventes tecnologias.`;

async function saveFiles(projectId, files) {
  await db.withTransaction(async (client) => {
    await client.query("DELETE FROM generated_files WHERE project_id = $1", [projectId]);
    for (const f of files) {
      await client.query("INSERT INTO generated_files (project_id, path, content) VALUES ($1, $2, $3)", [
        projectId,
        f.path,
        f.content,
      ]);
    }
  });
}

async function run(input, ctx) {
  const { projectId, projectName, analysis, modules } = input;
  const slug = slugify(projectName);
  const stackText = describeStack(analysis.stack) || "un stack por definir";
  const warnings = [];

  if (env.DEVOPS_AGENT_MODE !== "off") {
    warnings.push(`DEVOPS_AGENT_MODE=${env.DEVOPS_AGENT_MODE} todavia no esta disponible; se usan las plantillas`);
  }

  // 1) Texto del README (si el LLM falla, se usa el texto de plantilla)
  ctx.progress("Redactando el README");
  const readmeInput = { objective: analysis.objective, stackText, modules };
  let readmeText;
  try {
    readmeText = await generateStructured({
      model: env.LLM_MODEL_FAST,
      system: README_SYSTEM,
      user: [
        `Proyecto: ${projectName}`,
        `Objetivo: ${analysis.objective}`,
        `Stack: ${stackText}`,
        "Requerimientos:",
        ...analysis.requirements.map((r) => `- ${r}`),
        "Modulos y tareas:",
        ...modules.map((m) => `- ${m.name}: ${m.tasks.map((t) => t.title).join("; ")}`),
      ].join("\n"),
      responseSchema: ReadmeGemini,
      zodSchema: ReadmeSchema,
      temperature: 0.4,
      mockKey: "readme",
      mockInput: readmeInput,
      ctx,
    });
  } catch (err) {
    warnings.push(`README con texto de plantilla: ${err.message}`);
    readmeText = mock.get("readme", readmeInput);
  }

  // 2) Archivos desde plantillas
  ctx.progress("Armando los archivos desde plantillas");
  const files = buildFiles({ projectName, slug, stack: analysis.stack, modules, readmeText });
  await saveFiles(projectId, files);

  // 3) Repositorio en GitHub; si no se puede, queda el ZIP
  let repoUrl = null;
  let gh;
  if (!github.isConfigured()) {
    gh = { status: "skipped", reason: "GITHUB_TOKEN o GITHUB_OWNER no estan configurados" };
    console.warn(`[devops] ${gh.reason}; se deja el ZIP para descargar`);
  } else {
    ctx.progress(`Creando el repositorio ${slug} en GitHub`);
    try {
      const result = await github.publishRepo({
        name: slug,
        fallbackName: `${slug}-${projectId.slice(0, 6)}`,
        description: analysis.objective,
        files,
        onProgress: ctx.progress,
      });
      repoUrl = result.url;
      gh = { status: "created", repo: result.name, commitSha: result.commitSha };
    } catch (err) {
      gh = { status: "failed", error: github.describeError(err) };
      console.warn(`[devops] ${gh.error}; se deja el ZIP para descargar`);
    }
  }

  await db.query("UPDATE projects SET repo_url = $2, updated_at = NOW() WHERE id = $1", [projectId, repoUrl]);

  const summary = repoUrl
    ? `Repositorio creado: ${repoUrl}. ${files.length} archivos en un commit.`
    : `${files.length} archivos generados. ${gh.status === "failed" ? "GitHub fallo" : "GitHub no esta configurado"}; el entorno queda como ZIP.`;

  return {
    summary,
    repoUrl,
    zipUrl: repoUrl ? null : zipUrl(projectId),
    github: gh,
    files: files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content) })),
    warnings,
  };
}

module.exports = { run };
