const {test} = require('node:test');
const assert = require('node:assert/strict');
const {extractText} = require('../src/modules/team/utils/documents');
const {combineProjectInput} = require('../src/modules/team/utils/projectInput');
const file = text => ({buffer:Buffer.from(text),size:Buffer.byteLength(text),originalname:'minuta.txt'});

test('attached text is extracted fully and placed ahead of secondary comments', async()=>{
  const text = 'Crear un sistema de reservas para una clínica dental. La entrega incluye horarios y cancelaciones.';
  const document = await extractText(file(text));
  assert.equal(document.text,text);
  assert.equal(document.truncated,false);
  const input = combineProjectInput(document.text,'Proyecto de equipo');
  assert.ok(input.includes(text));
  assert.ok(input.indexOf(text)<input.indexOf('Proyecto de equipo'));
});

test('empty or oversized attachments fail instead of silently reading a description or an excerpt', async()=>{
  await assert.rejects(extractText(file('   ')),/casi no tiene texto/);
  const long = await extractText(file('a'.repeat(78074)));
  assert.equal(long.text.length,78074);
  assert.equal(long.chunks,10);
  await assert.rejects(extractText(file('a'.repeat(500001))),/Divide el archivo/);
});
