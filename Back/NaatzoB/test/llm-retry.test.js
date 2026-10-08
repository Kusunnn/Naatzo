const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, isRetryableAxiosError } = require('../src/modules/team/utils/retry');

test('temporary Gemini 503 is retried and can recover', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    if (++attempts < 3) throw { response: { status: 503 } };
    return 'recovered';
  }, { retries: 3, initialDelayMs: 0, maxDelayMs: 0 });
  assert.equal(result, 'recovered');
  assert.equal(attempts, 3);
});

test('persistent 503 stops after the configured retries; 404 is not retried', async () => {
  let attempts = 0;
  const error = { response: { status: 503 } };
  await assert.rejects(withRetry(async () => { attempts++; throw error; }, {
    retries: 3, initialDelayMs: 0, maxDelayMs: 0,
  }), thrown => thrown === error);
  assert.equal(attempts, 4);
  assert.equal(isRetryableAxiosError({ response: { status: 404 } }), false);
});
