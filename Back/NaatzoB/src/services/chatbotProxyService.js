const { chatbotServiceUrl } = require("../config/env");
const { HttpError } = require('../utils/httpError');

async function callChatbot(path, init = {}) {
  let response;
  try { response = await fetch(`${chatbotServiceUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(90000),
  }); } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new HttpError(504, 'El chatbot tardó demasiado en responder. Intenta de nuevo.');
    throw new HttpError(503, 'El servicio del chatbot está apagado o no se pudo conectar. Inicia NaatzoE o usa npm run start:all en el backend.');
  }

  if (!response.ok) {
    const text = await response.text();
    let reason;
    try { reason = JSON.parse(text).error; } catch { /* Use a safe default for non-JSON responses. */ }
    if (typeof reason === 'string' && /API_KEY.*(no definida|en .env)|Configura LLM_API_KEY/i.test(reason)) {
      throw new HttpError(503, 'Falta configurar la clave de Gemini en NaatzoE/.env (LLM_API_KEY y EMBEDDINGS_API_KEY).');
    }
    if (typeof reason === 'string' && /Todos los embeddings fallaron/i.test(reason)) {
      throw new HttpError(503, 'No se pudo procesar el documento con el servicio de IA. Revisa la clave de embeddings y los créditos del proveedor en NaatzoE.');
    }
    if (response.status === 429) throw new HttpError(429, 'El servicio de IA alcanzó su límite de uso. Intenta más tarde.');
    throw new HttpError(502, `El servicio del chatbot no pudo responder (estado ${response.status}).`);
  }

  return response.json();
}

module.exports = {
  callChatbot,
};
