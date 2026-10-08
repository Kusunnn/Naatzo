// src/integrations/github.js
//
// Crea el repositorio y sube todos los archivos en un solo commit con la API
// de Git. La API de Git responde 409 si el repositorio esta vacio, por eso se
// crea con auto_init: true y el commit va encima del inicial.

const { Octokit } = require("@octokit/rest");
const env = require("../config/env");
const { withRetry } = require("../utils/retry");

function isConfigured() {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER);
}

let _octokit = null;
function client() {
  if (!_octokit) {
    _octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
      userAgent: "naatzo-backend",
      request: { timeout: 20_000 },
      // Los errores se reportan en espanol desde aqui; se apagan los logs internos.
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
  }
  return _octokit;
}

async function createRepo(name, description) {
  const params = { name, description: description.slice(0, 300), auto_init: true, private: false };
  const { data } =
    env.GITHUB_OWNER_TYPE === "org"
      ? await client().rest.repos.createInOrg({ org: env.GITHUB_OWNER, ...params })
      : await client().rest.repos.createForAuthenticatedUser(params);
  return data;
}

/**
 * Crea el repo (si el nombre ya existe, prueba con un sufijo) y sube los
 * archivos en un commit. Regresa { url, name, commitSha }.
 */
async function publishRepo({ name, fallbackName, description, files, onProgress = () => {} }) {
  let repo;
  try {
    repo = await createRepo(name, description);
  } catch (err) {
    // 422: ya existe un repo con ese nombre
    if (err.status !== 422 || !fallbackName) throw err;
    onProgress(`Ya existe ${name}; se usa ${fallbackName}`);
    repo = await createRepo(fallbackName, description);
  }

  const owner = repo.owner.login;
  const repoName = repo.name;
  const branch = repo.default_branch;
  const gh = client().rest.git;

  // Recien creado, el ref puede tardar unos segundos en existir.
  const { data: ref } = await withRetry(() => gh.getRef({ owner, repo: repoName, ref: `heads/${branch}` }), {
    label: "github.getRef",
    retries: 4,
    initialDelayMs: 800,
    shouldRetry: (e) => [404, 409].includes(e.status),
  });
  const { data: base } = await gh.getCommit({ owner, repo: repoName, commit_sha: ref.object.sha });

  onProgress(`Subiendo ${files.length} archivos en un commit`);
  // Archivos de texto: el contenido va directo en el arbol, sin crear blobs uno por uno.
  const { data: tree } = await gh.createTree({
    owner,
    repo: repoName,
    base_tree: base.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
  });
  const { data: commit } = await gh.createCommit({
    owner,
    repo: repoName,
    message: "Estructura inicial generada por Naatzo",
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await gh.updateRef({ owner, repo: repoName, ref: `heads/${branch}`, sha: commit.sha });

  return { url: repo.html_url, name: repoName, commitSha: commit.sha };
}

/** Mensaje legible de un error de Octokit, sin datos del token. */
function describeError(err) {
  if (err.status === 401) return "GitHub rechazo el token (401)";
  if (err.status === 403) return `GitHub nego el permiso (403): ${err.response?.data?.message || err.message}`;
  if (err.status === 404) return `No se encontro el owner ${env.GITHUB_OWNER} o el token no tiene acceso (404)`;
  if (err.status) return `GitHub respondio ${err.status}: ${err.response?.data?.message || err.message}`;
  return `No se pudo contactar a GitHub: ${err.message}`;
}

module.exports = { isConfigured, publishRepo, describeError };
