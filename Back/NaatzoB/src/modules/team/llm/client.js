// src/llm/client.js
//
// Cliente de Gemini (basado en services/ai.js de KIBO 1) con salida
// estructurada: toda respuesta se pide como JSON con responseSchema y se
// valida con Zod. Si la validacion falla, se reintenta una vez mandando el
// error al modelo.
//
// Cambios contra KIBO 1:
//   - la llave va en el header x-goog-api-key, no en ?key= (asi no queda en logs)
//   - generationConfig.responseMimeType = "application/json" + responseSchema
//   - modo mock (LLM_PROVIDER=mock o sin llave) con respuestas fijas

const axios = require("axios");
const env = require("../config/env");
const { withRetry, isRetryableAxiosError } = require("../utils/retry");
const { KeyPool, parseKeys, withKeyRotation } = require("../utils/key-pool");
const mock = require("./mock");

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MOCK_DELAY_MS = 800;

let _pool = null;
function pool() {
  if (!_pool) {
    _pool = new KeyPool(parseKeys(env.LLM_API_KEY), { cooldownMs: 60 * 60 * 1000 });
  }
  return _pool;
}

const isQuotaError = (err) =>
  err?.response?.status === 429 ||
  (err?.response?.status === 403 &&
    /quota|limit|exceeded/i.test(err?.response?.data?.error?.message || ""));

const shouldRetryExceptQuota = (err) => !isQuotaError(err) && isRetryableAxiosError(err);

/** Error legible a partir de la respuesta de Gemini, sin datos de la llave. */
function describeHttpError(err, model) {
  const status = err?.response?.status;
  const detail = err?.response?.data?.error?.message;
  if (status === 503) return `Gemini (${model}) está temporalmente saturado (503). Se agotaron los reintentos automáticos; espera un momento y usa Reintentar paso fallido.${detail ? ` Detalle: ${detail}` : ""}`;
  if (status) return `Gemini (${model}) respondio ${status}${detail ? `: ${detail}` : ""}`;
  return `No se pudo contactar a Gemini (${model}): ${err.code || err.message}`;
}

/** Una llamada a generateContent. Regresa el texto y el uso de tokens. */
async function callGemini({ model, system, user, responseSchema, temperature, maxOutputTokens }) {
  return withKeyRotation(pool(), async (apiKey) => {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema,
      },
    };
    const response = await withRetry(
      () =>
        axios.post(`${BASE_URL}/${model}:generateContent`, body, {
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          timeout: 60_000,
        }),
      { label: `llm.${model}`, retries: 3, initialDelayMs: 2000, maxDelayMs: 10000, shouldRetry: shouldRetryExceptQuota },
    );

    const candidate = response.data?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
    const meta = response.data?.usageMetadata || {};
    return {
      text,
      finishReason: candidate?.finishReason,
      usage: { inputTokens: meta.promptTokenCount || 0, outputTokens: meta.candidatesTokenCount || 0 },
    };
  });
}

/** Intenta parsear y validar; regresa { data } o { error } con el problema en texto. */
function parseAndValidate(text, finishReason, zodSchema) {
  if (finishReason && finishReason !== "STOP") {
    return { error: `La respuesta se corto (finishReason: ${finishReason})` };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { error: `La respuesta no es JSON valido: ${err.message}` };
  }
  const result = zodSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    return { error: `El JSON no cumple el esquema: ${issues}` };
  }
  return { data: result.data };
}

/**
 * Pide JSON estructurado al modelo y lo valida con Zod.
 *
 * @param {object} opts
 * @param {string} opts.model           Modelo de Gemini (LLM_MODEL_FAST o LLM_MODEL_SMART)
 * @param {string} [opts.fallbackModel] Modelo de respaldo si se acaba la cuota del principal
 * @param {string} opts.system          Instrucciones de sistema
 * @param {string} opts.user            Mensaje del usuario (los datos)
 * @param {object} opts.responseSchema  Esquema para Gemini (subconjunto de OpenAPI)
 * @param {import("zod").ZodType} opts.zodSchema  Esquema con el que se valida
 * @param {string} opts.mockKey         Respuesta fija a usar en modo mock
 * @param {object} [opts.mockInput]     Datos para armar la respuesta mock
 * @param {object} [opts.ctx]           Contexto del orquestador (cuenta tokens)
 */
async function generateStructured({
  model,
  fallbackModel,
  system,
  user,
  responseSchema,
  zodSchema,
  mockKey,
  mockInput,
  ctx,
  temperature = 0.2,
  maxOutputTokens = 4096,
}) {
  if (env.LLM_MOCK) {
    // Pausa corta para que en la demo se vea avanzar a cada agente por SSE.
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    return useMock({ mockKey, mockInput, zodSchema, ctx, label: "mock" });
  }

  let currentModel = model;
  let prompt = user;
  let lastError;

  // Primer intento y un reintento mandando el error de validacion.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await callGemini({
        model: currentModel,
        system,
        user: prompt,
        responseSchema,
        temperature,
        maxOutputTokens,
      });
    } catch (err) {
      if (isQuotaError(err) && fallbackModel && currentModel !== fallbackModel) {
        console.warn(`[llm] Cuota agotada en ${currentModel}; se usa ${fallbackModel}`);
        currentModel = fallbackModel;
        attempt--; // el cambio de modelo no cuenta como reintento
        continue;
      }
      // Respaldo para la demo: si no hay internet o Gemini no responde, se
      // usa la respuesta fija en lugar de tirar la ejecucion.
      if (env.DEMO_MODE && mock.has(mockKey)) {
        console.warn(`[llm] ${describeHttpError(err, currentModel)}. Se usa la respuesta mock de respaldo.`);
        return useMock({ mockKey, mockInput, zodSchema, ctx, label: "mock-respaldo" });
      }
      throw new Error(describeHttpError(err, currentModel));
    }

    ctx?.recordLlm({ model: currentModel, usage: res.usage });
    const { data, error } = parseAndValidate(res.text, res.finishReason, zodSchema);
    if (data) return data;

    lastError = error;
    console.warn(`[llm] ${currentModel} intento ${attempt}: ${error}`);
    prompt =
      `${user}\n\n` +
      `Tu respuesta anterior no paso la validacion: ${error}\n` +
      "Corrige el problema y devuelve unicamente JSON que cumpla el esquema.";
  }

  throw new Error(`El modelo no devolvio una respuesta valida: ${lastError}`);
}

function useMock({ mockKey, mockInput, zodSchema, ctx, label }) {
  const raw = mock.get(mockKey, mockInput);
  ctx?.recordLlm({ model: label, usage: null });
  // La respuesta fija pasa por la misma validacion que la del modelo.
  const result = zodSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`La respuesta mock "${mockKey}" no cumple el esquema: ${result.error.message}`);
  }
  return result.data;
}

module.exports = { generateStructured };
