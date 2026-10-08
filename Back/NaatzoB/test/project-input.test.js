const {test}=require('node:test');
const assert=require('node:assert/strict');
const {combineProjectInput}=require('../src/modules/team/utils/projectInput');

test('project input accepts description, document, or both and preserves comments',()=>{
  assert.equal(combineProjectInput(undefined,' Una exposición '),'Una exposición');
  assert.equal(combineProjectInput('Apuntes de química',''),'Apuntes de química');
  const combined=combineProjectInput('Apuntes de química','Es una exposición de diez minutos.');
  assert.match(combined,/Es una exposición de diez minutos/);
  assert.match(combined,/Apuntes de química/);
  assert.ok(combined.indexOf('Apuntes de química') < combined.indexOf('Es una exposición'));
  assert.throws(()=>combineProjectInput('a'.repeat(500_000),'Preparar diapositivas.'),/no se recortará/);
  assert.equal(combineProjectInput('a'.repeat(30_000),''),'a'.repeat(30_000));
  assert.equal(combineProjectInput('a'.repeat(78074),'').length,78074);
  assert.throws(()=>combineProjectInput('a'.repeat(500_001),''),/supera/);
  assert.throws(()=>combineProjectInput('','Una descripción válida'),/No se pudo extraer/);
  assert.throws(()=>combineProjectInput('archivo',{}),/deben ser texto/);
  assert.throws(()=>combineProjectInput('archivo','a'.repeat(500_001)),/500000/);
});
