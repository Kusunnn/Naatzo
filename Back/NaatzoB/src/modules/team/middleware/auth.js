// src/middleware/auth.js
//
// Verifica el JWT y deja el usuario en req.user. Todas las consultas se
// filtran por req.user.id; nunca por un userId que mande el cliente.

const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

function readToken(req, { allowQuery }) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  // El EventSource del navegador no deja mandar headers: para SSE se acepta ?token=
  if (allowQuery && typeof req.query.token === "string") return req.query.token;
  return null;
}

function buildAuth({ allowQuery = false } = {}) {
  return (req, res, next) => {
    const token = readToken(req, { allowQuery });
    if (!token) {
      return res.status(401).json({ ok: false, error: "Falta el token de sesion" });
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, name: payload.name };
      next();
    } catch {
      res.status(401).json({ ok: false, error: "Token invalido o vencido" });
    }
  };
}

const requireAuth = buildAuth();
const requireAuthSse = buildAuth({ allowQuery: true });

module.exports = { signToken, requireAuth, requireAuthSse };
