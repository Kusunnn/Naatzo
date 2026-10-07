// src/routes/auth.routes.js
//   POST /api/auth/register  crea el usuario y regresa token
//   POST /api/auth/login     regresa { token, user }
//   GET  /api/auth/me        datos del usuario del token

const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { signToken, requireAuth } = require("../middleware/auth");
const { validate, conflict, HttpError, notFound } = require("../utils/http");

const router = express.Router();

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(100),
  email: z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres").max(200),
});

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(1, "La contrasena es obligatoria"),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.created_at });

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password } = validate(RegisterSchema, req.body);
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, created_at`,
      [name, email, hash],
    );
    if (rows.length === 0) throw conflict("Ya existe una cuenta con ese correo");
    const user = rows[0];
    res.status(201).json({ ok: true, token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = validate(LoginSchema, req.body);
    const { rows } = await db.query(
      "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1",
      [email],
    );
    const user = rows[0];
    const valid = user && (await bcrypt.compare(password, user.password_hash));
    if (!valid) throw new HttpError(401, "Correo o contrasena incorrectos");
    res.json({ ok: true, token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.user.id],
    );
    if (rows.length === 0) throw notFound("Usuario no encontrado");
    res.json({ ok: true, user: publicUser(rows[0]) });
  }),
);

module.exports = router;
