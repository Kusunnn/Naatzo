const {test}=require('node:test');
const assert=require('node:assert/strict');
const {combineProjectInput}=require('../src/modules/team/utils/projectInput');

test('project input accepts description, document, or both and preserves comments',()=>{
  assert.equal(combineProjectInput(undefined,' Una exposición '),'Una exposición');
  assert.equal(combineProjectInput('Apuntes de química',''),'Apuntes de química');
  const combined=combineProjectInput('Apuntes de química','Es una exposición de diez minutos.');
  assert.match(combined,/Es una exposición de diez minutos/);
  assert.match(combined,/Apuntes de química/);
  const long=combineProjectInput('a'.repeat(30_000),'Preparar diapositivas.');
  assert.equal(long.length,30_000);
  assert.match(long,/Preparar diapositivas/);
  assert.throws(()=>combineProjectInput('archivo',{}),/deben ser texto/);
  assert.throws(()=>combineProjectInput('archivo','a'.repeat(30_001)),/30,000/);
});
