const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.LLM_PROVIDER = 'ollama';
const env = require('../src/modules/team/config/env');
const axios = require('axios');
const { z } = require('zod');
const { generateStructured } = require('../src/modules/team/llm/client');

test('Ollama uses the local model and validates JSON with a correction attempt', async t => {
  const original = axios.post;
  t.after(() => { axios.post = original; });
  let attempts = 0;
  const usage = [];
  axios.post = async (url, body) => {
    assert.equal(url, `${env.OLLAMA_BASE_URL}/api/chat`);
    assert.equal(body.model, env.OLLAMA_MODEL);
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.format.type, 'object');
    attempts++;
    return { data: { done_reason: 'stop', message: { content: JSON.stringify({answer: attempts === 1 ? 1 : 'correcto'}) }, prompt_eval_count: 12, eval_count: 5 } };
  };
  assert.equal(env.LLM_MOCK, false);
  const result = await generateStructured({model:'unused-gemini',system:'JSON',user:'Pregunta',zodSchema:z.object({answer:z.string()}),ctx:{recordLlm:r=>usage.push(r)}});
  assert.equal(result.answer, 'correcto');
  assert.equal(attempts, 2);
  assert.equal(usage[0].model, env.OLLAMA_MODEL);
  assert.equal(usage[0].usage.inputTokens, 12);
});

test('Ollama failures never silently use demo output', async t => {
  const original = axios.post;
  const demo = env.DEMO_MODE;
  t.after(() => { axios.post = original; env.DEMO_MODE = demo; });
  env.DEMO_MODE = true;
  axios.post = async () => { throw { code: 'ECONNREFUSED' }; };
  await assert.rejects(generateStructured({model:'unused',system:'JSON',user:'Pregunta',mockKey:'analyst',zodSchema:z.object({answer:z.string()})}), /Ollama.*ECONNREFUSED/);
});
