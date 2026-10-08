const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.LLM_API_KEY = 'test-only';
const axios = require('axios');
const { generateText } = require('../src/services/ai');
test('joins all visible parts and continues a token-limited response with its conversation', async t => {
  const original = axios.post;
  t.after(() => { axios.post = original; });
  let calls = 0;
  axios.post = async (_url, body) => {
    calls++;
    if (calls === 1) return { data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Primera ' }, { text: 'parte. ' }] } }] } };
    assert.equal(body.contents[1].role, 'model');
    assert.equal(body.contents[1].parts[0].text, 'Primera parte. ');
    return { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Final.' }] } }] } };
  };
  assert.equal(await generateText({ systemPrompt: 'Tutor', userPrompt: 'Pregunta', completeResponse: true }), 'Primera parte. Final.');
  assert.equal(calls, 2);
});
test('bounded continuation explicitly warns instead of silently truncating', async t => {
  const original = axios.post;
  t.after(() => { axios.post = original; });
  let calls = 0;
  axios.post = async () => {
    calls++;
    return { data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Texto ' }] } }] } };
  };
  assert.match(await generateText({ systemPrompt: 'Tutor', userPrompt: 'Pregunta', completeResponse: true }), /alcanzó el límite/);
  assert.equal(calls, 3);
});
