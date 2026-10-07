// src/integrations/notify.js
//
// Registro y envio de avisos. Cada aviso lleva una clave unica (dedupe_key)
// en la tabla notifications; si la clave ya existe, el aviso no se repite.
// Si no hay canal configurado, el aviso queda en el historial como
// "skipped" para mostrarlo en pantalla.

const db = require("../db");
const discord = require("./discord");

function currentChannel() {
  return discord.isConfigured() ? "discord" : "pantalla";
}

/**
 * Aparta la clave del aviso. Regresa el id, o null si ya se habia mandado.
 * Sin dedupeKey (por ejemplo, el mensaje de prueba) siempre se registra.
 */
async function reserve({ projectId, taskId = null, type, message, dedupeKey = null }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (project_id, task_id, channel, type, message, status, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, 'skipped', $6)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [projectId, taskId, currentChannel(), type, message, dedupeKey],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Manda el texto por el canal configurado. Nunca lanza: regresa el resultado. */
async function deliver(text) {
  if (!discord.isConfigured()) {
    return { channel: "pantalla", status: "skipped", error: "DISCORD_WEBHOOK_URL no esta configurado" };
  }
  try {
    await discord.send(text);
    return { channel: "discord", status: "sent", error: null };
  } catch (err) {
    const error = discord.describeError(err);
    console.warn(`[notify] ${error}`);
    return { channel: "discord", status: "failed", error };
  }
}

/** Guarda el resultado en las filas reservadas. */
async function finish(ids, result, message = null) {
  if (ids.length === 0) return;
  await db.query(
    `UPDATE notifications
     SET status = $2, channel = $3, error = $4,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         message = COALESCE($5, message),
         -- Si fallo el envio se libera la clave para reintentar en la siguiente revision.
         dedupe_key = CASE WHEN $2 = 'failed' THEN NULL ELSE dedupe_key END
     WHERE id = ANY($1)`,
    [ids, result.status, result.channel, result.error, message],
  );
}

/** Registra y manda un aviso. Regresa { status: 'sent'|'skipped'|'failed'|'duplicate', ... } */
async function notify({ projectId, taskId, type, message, dedupeKey }) {
  const id = await reserve({ projectId, taskId, type, message, dedupeKey });
  if (!id) return { status: "duplicate", channel: currentChannel(), error: null };
  const result = await deliver(message);
  await finish([id], result);
  return { ...result, id };
}

module.exports = { notify, reserve, deliver, finish, currentChannel };
