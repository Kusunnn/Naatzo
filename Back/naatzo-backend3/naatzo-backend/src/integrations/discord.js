// src/integrations/discord.js
// Aviso por webhook de Discord. La URL del webhook funciona como secreto:
// nunca se escribe en logs ni en respuestas.

const axios = require("axios");
const env = require("../config/env");
const { withRetry } = require("../utils/retry");

const MAX_CONTENT = 2000; // limite de Discord para content

function isConfigured() {
  return Boolean(env.DISCORD_WEBHOOK_URL);
}

function truncate(text) {
  return text.length <= MAX_CONTENT ? text : `${text.slice(0, MAX_CONTENT - 3)}...`;
}

/** Manda el mensaje. Con wait=true Discord confirma que lo guardo y regresa su id. */
async function send(content) {
  const { data } = await withRetry(
    () =>
      axios.post(
        `${env.DISCORD_WEBHOOK_URL}?wait=true`,
        {
          username: "Naatzo",
          content: truncate(content),
          // Que ningun texto pueda mencionar a @everyone o a roles.
          allowed_mentions: { parse: [] },
        },
        { timeout: 10_000 },
      ),
    { label: "discord", retries: 2 },
  );
  return { messageId: data?.id || null };
}

/** Error legible sin la URL del webhook. */
function describeError(err) {
  const status = err?.response?.status;
  if (status) return `Discord respondio ${status}: ${err.response.data?.message || "sin detalle"}`;
  return `No se pudo contactar a Discord: ${err.code || err.message}`;
}

module.exports = { isConfigured, send, describeError, MAX_CONTENT };
