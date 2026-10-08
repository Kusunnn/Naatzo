const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeStack}=require('../src/modules/team/templates/catalog');
const {assertPlanGrounding}=require('../src/modules/team/agents/planner');
const analysis={objective:'Preparar exposición de biología',requirements:['Explicar metabolismo y genética'],mentionedTasks:[],stack:{frontend:null,backend:null,database:null,extras:[]}};
const plan=title=>({modules:[{name:'Trabajo',tasks:[{title,description:'',acceptanceCriteria:['Resultado revisado']}]}]});

test('missing technologies stay null rather than inserting the default demo stack',()=>{
  const {stack,questions}=normalizeStack(analysis.stack);
  assert.equal(stack.backend,null);
  assert.equal(stack.database,null);
  assert.equal(questions.length,0);
});
test('academic plans reject unsupported technical tasks but accept relevant deliverables',()=>{
  assert.doesNotThrow(()=>assertPlanGrounding(plan('Preparar diapositivas sobre metabolismo'),analysis));
  assert.throws(()=>assertPlanGrounding(plan('Configurar backend Node y Express'),analysis),/sin respaldo/);
  assert.throws(()=>assertPlanGrounding(plan('Configurar base de datos PostgreSQL'),analysis),/sin respaldo/);
});
test('software explicitly requested in the project can have technical tasks',()=>{
  assert.doesNotThrow(()=>assertPlanGrounding(plan('Configurar backend Node y Express'),{...analysis,objective:'Crear aplicación para estudiar biología'}));
});
