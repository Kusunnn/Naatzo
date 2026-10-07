// src/middleware/errorHandler.js (de KIBO 1)

/**
 * Wrapper para handlers async. Permite escribir:
 *   router.get("/", asyncHandler(async (req, res) => { ... }));
 * sin repetir try/catch: los errores van al middleware global.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 404 por defecto. */
function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
}

/** Middleware global de errores. Debe ser el ultimo `app.use`. */
function errorHandler(err, req, res, next) {
  // Si ya se mandaron headers (por ejemplo en SSE) solo queda cerrar.
  if (res.headersSent) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
    return next(err);
  }

  // JSON mal formado en el body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "El cuerpo no es JSON valido" });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    status >= 500 && err.expose !== true
      ? "Error interno del servidor"
      : err.message || "Error desconocido";

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err);
  } else {
    console.warn(`[warn] ${req.method} ${req.originalUrl}: ${message}`);
  }

  const body = { ok: false, error: message };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

module.exports = {
  asyncHandler,
  errorHandler,
  notFoundHandler,
};
