// src/utils/http.js
// Errores HTTP con status y validacion de bodies con Zod.

const { HttpError } = require('../../../utils/httpError');

const badRequest = (msg, details) => new HttpError(400, msg, details);
const notFound = (msg = "No encontrado") => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);

/** Valida `data` con un esquema Zod; si falla lanza 400 con el detalle. */
function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    throw badRequest("Datos invalidos", details);
  }
  return result.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revisa que un parametro de ruta sea UUID; si no, responde 404 con `message`. */
function requireUuid(value, message = "Recurso no encontrado") {
  if (!UUID_RE.test(String(value))) throw notFound(message);
  return value;
}

module.exports = { HttpError, badRequest, notFound, conflict, validate, requireUuid };
