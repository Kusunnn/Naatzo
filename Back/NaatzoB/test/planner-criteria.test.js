const {test} = require('node:test');
const assert = require('node:assert/strict');
process.env.LLM_PROVIDER = 'mock';
const db = require('../src/modules/team/db');
const board = require('../src/modules/team/db/board');
const planner = require('../src/modules/team/agents/planner');
const {PlanSchema} = require('../src/modules/team/llm/schemas');
const mock = require('../src/modules/team/llm/mock');

test('criteria are required and only unblocked, valid tasks are initial', () => {
  const plan = mock.get('planner');
  assert.equal(PlanSchema.safeParse(plan).success, true);
  delete plan.modules[0].tasks[0].acceptanceCriteria;
  assert.equal(PlanSchema.safeParse(plan).success, false);
  assert.equal(planner.isFirstTask({dependsOn:[],flags:[]}), true);
  assert.equal(planner.isFirstTask({dependsOn:['T1'],flags:[]}), false);
  assert.equal(planner.isFirstTask({dependsOn:[],flags:['dependencia_ciclica']}), false);
  assert.equal(planner.isFirstTask({dependsOn:[],flags:['dependencia_invalida']}), false);
});

test('planner saves criteria as unchecked checklist items and separates initial tasks', async t => {
  const originalTransaction = db.withTransaction;
  const originalActivity = board.recordActivity;
  t.after(() => {db.withTransaction = originalTransaction; board.recordActivity = originalActivity;});
  const calls = [];
  let id = 0;
  db.withTransaction = async fn => fn({query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT * FROM board_lists'))return {rows:[{id:'todo',title:'Por hacer',stage:'todo',position:0}]};
    if(sql.startsWith('INSERT INTO board_lists'))return {rows:[{id:'first',title:'Primeras tareas',stage:'todo',position:1}]};
    return {rows:[{id:`id-${++id}`}]};
  }});
  board.recordActivity = async()=>{};
  const result = await planner.run({projectId:'test',projectName:'Prueba',analysis:mock.get('analyst'),members:[{id:'member',name:'Ana',skills:['frontend','backend','devops','diseno'],weeklyHours:40}],startDate:'2026-10-08',deadline:'2027-11-20'}, {progress:()=>{},recordLlm:()=>{}});
  const inserts = calls.filter(c=>c.sql.startsWith('INSERT INTO tasks'));
  assert.equal(inserts.length,result.tasks.length);
  for(const task of result.tasks){
    const insert = inserts.find(c=>c.params[2]===task.title);
    assert.equal(insert.params[12],task.column==='first-tasks'?'first':'todo');
    assert.ok(task.acceptanceCriteria.length>=2);
  }
  const criteria = calls.filter(c=>c.sql.startsWith('INSERT INTO checklist_items'));
  assert.equal(criteria.length,result.tasks.reduce((n,task)=>n+task.acceptanceCriteria.length,0));
  assert.ok(criteria.every(c=>c.sql.includes('FALSE')));
  assert.ok(result.tasks.some(t=>t.column==='first-tasks'));
  assert.ok(result.tasks.some(t=>t.column==='todo'));
  assert.ok(result.tasks.filter(t=>t.column==='first-tasks').length<=2);
});

test('initial tasks are capped at two per assignee and prefer priority without bypassing dependencies',()=>{
  const task=(key,assigneeId,priority='medium',dependsOn=[])=>({key,assigneeId,priority,dependsOn,flags:[]});
  const tasks=[task('A-low','Ana','low'),task('A-high','Ana','high'),task('A-medium','Ana'),task('A-blocked','Ana','high',['A-high']),task('B-one','Luis'),task('B-two','Luis'),task('B-three','Luis'),task('unassigned','')];
  const selected=planner.selectFirstTasks(tasks);
  assert.deepEqual([...selected],['A-high','A-medium','B-one','B-two']);
  assert.equal(planner.selectFirstTasks([task('only','Ana')]).size,1);
  assert.equal(planner.selectFirstTasks([task('blocked','Ana','high',['other'])]).size,0);
});
