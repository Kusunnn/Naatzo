const {test}=require('node:test');
const assert=require('node:assert/strict');
const {splitText}=require('../src/modules/team/utils/textChunks');
const db=require('../src/modules/team/db');
const llm=require('../src/modules/team/llm/client');
const calls=[];
let fail=false;
llm.generateStructured=async options=>{
  calls.push(options);
  if(fail && calls.length===2)throw new Error('modelo desconectado');
  return {objective:'Crear agenda dental',stack:{frontend:'React',backend:'Node',database:'PostgreSQL',extras:[]},requirements:['Registrar citas'],mentionedTasks:[],deadline:null,openQuestions:[]};
};
const analyst=require('../src/modules/team/agents/analyst');

test('splitting preserves every character and does not split surrogate pairs',()=>{
  for(const text of ['abc '.repeat(20000),'x'.repeat(7999)+'😀'+'y'.repeat(9000)]){
    const chunks=splitText(text);
    assert.equal(chunks.join(''),text);
    assert.ok(chunks.every(c=>c.length<=8000));
    assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c)));
  }
});

test('all 78074 characters are analyzed, then consolidated with progress and a single save',async t=>{
  calls.length=0;fail=false;
  let saves=0;
  const original=db.query;t.after(()=>{db.query=original;});
  db.query=async()=>{saves++;return {rows:[]};};
  const progress=[];
  const text='x'.repeat(78074);
  const result=await analyst.run({text,documentFilename:'large.txt',projectId:'test'}, {progress:m=>progress.push(m)});
  assert.equal(result.documentParts,10);
  assert.equal(result.analyzedChars,78074);
  assert.equal(calls.length,19);
  const originalChunks=calls.slice(0,10).map(c=>c.user.match(/<minuta>\n([\s\S]*)\n<\/minuta>/)[1]);
  assert.equal(originalChunks.join(''),text);
  assert.equal(saves,1);
  assert.ok(progress.some(m=>m.includes('10 partes')));
  assert.ok(progress.some(m=>m.includes('Analizando parte 10 de 10')));
  assert.ok(progress.some(m=>m.includes('Consolidando')));
});

test('a failed fragment prevents saving a partial analysis',async t=>{
  calls.length=0;fail=true;
  let saves=0;
  const original=db.query;t.after(()=>{db.query=original;fail=false;});
  db.query=async()=>{saves++;};
  await assert.rejects(analyst.run({text:'x'.repeat(16001),documentFilename:'large.txt'}, {progress:()=>{}}),/parte 2 de 3.*modelo desconectado/);
  assert.equal(saves,0);
});
