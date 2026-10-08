// src/integrations/notify.js
//
// Registro y envio de avisos por correo. Cada aviso lleva una clave unica
// (dedupe_key) en la tabla notifications; si la clave ya existe, el aviso no
// se repite. Un aviso puede ir a varias personas, cada una con su propio
// texto (por ejemplo, el resumen del equipo mas "tus tareas").
// Si no hay SMTP configurado, el aviso queda en el historial como "skipped"
// para mostrarlo en pantalla.

const db = require("../db");
const email = require("./email");

function currentChannel() {
  return email.isConfigured() ? "correo" : "pantalla";
}

/**
 * Personas del equipo de un proyecto que pueden recibir correo: el dueno y los
 * miembros activos con correo (el de su cuenta o, si no tiene, el de su contacto).
 * @returns {Promise<Array<{ email, name, role: 'owner'|'member', memberId: string|null }>>}
 */
async function teamRecipients(projectId) {
  const { rows } = await db.query(
    `SELECT u.email, u.name, 'owner' AS role, NULL::uuid AS member_id
     FROM projects p JOIN teams t ON t.id = p.team_id JOIN public.naatzo_users u ON u.id = t.owner_id
     WHERE p.id = $1
     UNION ALL
     SELECT COALESCE(u.email, NULLIF(m.contact->>'email', '')), m.name, 'member', m.id
     FROM projects p JOIN members m ON m.team_id = p.team_id LEFT JOIN public.naatzo_users u ON u.id = m.user_id
     WHERE p.id = $1 AND m.active`,
    [projectId],
  );
  // Una persona puede ser dueno y miembro a la vez: un solo correo, con ambos datos.
  const byEmail = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    const current = byEmail.get(key);
    if (!current) byEmail.set(key, { email: r.email, name: r.name, role: r.role, memberId: r.member_id });
    else {
      if (r.role === "owner") current.role = "owner";
      if (r.member_id) Object.assign(current, { memberId: r.member_id, name: r.name });
    }
  }
  return [...byEmail.values()];
}

/**
 * Aparta la clave del aviso. Regresa el id, o null si ya se habia mandado.
 * Sin dedupeKey (por ejemplo, el mensaje de prueba) siempre se registra.
 */
async function reserve({ projectId, taskId = null, type, subject = null, message, dedupeKey = null }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (project_id, task_id, channel, type, subject, message, status, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'skipped', $7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [projectId, taskId, currentChannel(), type, subject, message, dedupeKey],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Manda los correos. Nunca lanza: regresa el resultado.
 * @param {Array<{ to: string, subject: string, text: string }>} emails
 */
async function deliver(emails) {
  const recipients = emails.map((e) => e.to);
  if (!email.isConfigured()) {
    return { channel: "pantalla", status: "skipped", error: "SMTP_HOST no esta configurado", recipients };
  }
  if (emails.length === 0) {
    return { channel: "correo", status: "skipped", error: "Nadie del equipo tiene correo registrado", recipients };
  }
  const failed = [];
  for (const e of emails) {
    try {
      await email.send(e);
    } catch (err) {
      const error = email.describeError(err);
      console.warn(`[notify] ${e.to}: ${error}`);
      failed.push(`${e.to}: ${error}`);
    }
  }
  // Si a todos les fallo, es "failed" y se puede reintentar; si a alguien le llego, "sent".
  const status = failed.length === emails.length ? "failed" : "sent";
  return { channel: "correo", status, error: failed.length ? failed.join("; ") : null, recipients };
}

/** Guarda el resultado en las filas reservadas. */
async function finish(ids, result, message = null) {
  if (ids.length === 0) return;
  await db.query(
    `UPDATE notifications
     SET status = $2, channel = $3, error = $4, recipients = $6,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         message = COALESCE($5, message),
         -- Si fallo el envio se libera la clave para reintentar en la siguiente revision.
         dedupe_key = CASE WHEN $2 = 'failed' THEN NULL ELSE dedupe_key END
     WHERE id = ANY($1)`,
    [ids, result.status, result.channel, result.error, message, result.recipients || []],
  );
}

/**
 * Registra y manda un aviso.
 * @returns {{ status: 'sent'|'skipped'|'failed'|'duplicate', channel, error, recipients }}
 */
async function notify({ projectId, taskId, type, subject, message, dedupeKey, emails }) {
  const id = await reserve({ projectId, taskId, type, subject, message, dedupeKey });
  if (!id) return { status: "duplicate", channel: currentChannel(), error: null, recipients: [] };
  const result = await deliver(emails);
  await finish([id], result);
  return { ...result, id };
}

module.exports = { notify, reserve, deliver, finish, teamRecipients, currentChannel };
