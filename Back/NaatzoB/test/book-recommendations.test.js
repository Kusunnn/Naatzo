const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recommendBooks, browseBooks, resolveBookTopic } = require('../src/services/bookService');
const payload = { count: 1, next: null, previous: null, results: [{ id: 1, title: 'Economics', authors: [{ name: 'Autor' }], subjects: ['Economics'], formats: { 'text/html': 'https://www.gutenberg.org/ebooks/1' } }] };

test('recommendations share requests by topic and reuse the cached result', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async url => {
    calls++;
    assert.equal(new URL(url).searchParams.get('topic'), 'economics');
    return { ok: true, json: async () => payload };
  };
  const results = await Promise.all([
    recommendBooks({ title: 'Calcular el pago del crédito' }),
    recommendBooks({ title: 'Preparar presupuesto' }),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0][0].title, 'Economics');
  assert.match(results[0][0].reason, /finanzas/);
  await recommendBooks({ title: 'Finanzas personales' });
  assert.equal(calls, 1);
});

test('expired recommendations return immediately while refreshing in background', async t => {
  const originalFetch = global.fetch, originalNow = Date.now;
  t.after(() => { global.fetch = originalFetch; Date.now = originalNow; });
  Date.now = () => originalNow() + 2 * 60 * 60 * 1000;
  let rejectRefresh;
  global.fetch = () => new Promise((resolve, reject) => { rejectRefresh = reject; });
  const result = await browseBooks({ topic: 'economics', recommendation: true });
  assert.equal(result.stale, true);
  assert.equal(result.books.length, 1);
  rejectRefresh(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
});

test('failed recommendation queries do not retry or hammer the upstream', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('offline'); };
  await assert.rejects(recommendBooks({ title: 'Psicología' }), /No se pudo conectar/);
  await assert.rejects(recommendBooks({ title: 'Psicología' }), /No se pudo conectar/);
  assert.equal(calls, 1);
});

test('common academic and financial topics are detected without full-title search', () => {
  assert.equal(resolveBookTopic('pago del préstamo e intereses'), 'economics');
  assert.equal(resolveBookTopic('Integrales de cálculo'), 'calculus');
  assert.equal(resolveBookTopic('Programación de algoritmos'), 'computer');
});
