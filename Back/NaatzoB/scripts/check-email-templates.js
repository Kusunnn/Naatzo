const assert = require('node:assert/strict');
const { catalog, renderEmail } = require('../src/services/emailTemplates');
const sample = { recipientName: 'María <script>', inviterName: 'José', memberName: 'Lucía', projectName: 'Diseño & desarrollo', taskName: 'Revisión de navegación', expiresAt: '2026-10-14T18:00:00Z', dueAt: '2026-10-15T18:00:00Z', priority: 'alta', changes: 'Nueva fecha de entrega.', notificationTitle: 'Aviso importante', message: 'Revisa tu próxima reunión.', url: 'https://example.com/board/123' };
for (const type of Object.keys(catalog)) {
  const result = renderEmail(type, sample);
  assert.ok(result.subject && result.text && result.html);
  assert.ok(result.text.includes(sample.recipientName));
  assert.ok(result.html.includes('Mar&#237;a &lt;script&gt;'));
  assert.ok(!/[^\x00-\x7f]/.test(result.html));
  assert.ok(!result.html.includes('<script>'));
  assert.ok(!/undefined|\[object Object\]/.test(result.text));
  for (const field of catalog[type].required) {
    const missing = { ...sample }; delete missing[field];
    assert.throws(() => renderEmail(type, missing));
  }
}
assert.throws(() => renderEmail('invitation', { ...sample, url: 'javascript:alert(1)' }));
assert.throws(() => renderEmail('invitation', { ...sample, expiresAt: 'bad date' }));
assert.ok(!renderEmail('deadlineReminder', { ...sample, projectName: undefined }).text.includes('proyecto'));
assert.ok(!renderEmail('invitation', { ...sample, projectName: 'Proyecto\nBcc: someone' }).subject.includes('\n'));
console.log(`${Object.keys(catalog).length} plantillas verificadas: campos, acentos, fechas y HTML seguro.`);
