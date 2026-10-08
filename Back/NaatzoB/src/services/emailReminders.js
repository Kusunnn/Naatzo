const db = require('../db/postgres');
const { readDb } = require('../repositories/dbRepository');
const mail = require('./emailService');
const { renderEmail } = require('./emailTemplates');
const { ensureTables } = require('./collaborationService');
const windows = [{ key:'24h',ms:86400000 },{key:'1h',ms:3600000}];
async function recipient(userId) { if(!userId)return null;const result=await db.query('SELECT name,email FROM naatzo_users WHERE id::text=$1',[userId]);return result.rows[0]; }
async function notifyAssignments(before,after) {
  if(!mail.configured())return;
  for(const task of after.snapshot.tasks) {
    const old=before.snapshot.tasks.find(previous=>previous.id===task.id);
    if(old?.assigneeId===task.assigneeId)continue;
    const member=after.snapshot.members.find(m=>m.id===task.assigneeId);const user=await recipient(member?.userId);if(!user?.email)continue;
    await mail.sendOnce(`assignment:${after.id}:${task.id}:${after.version}:${member.userId}`,{to:user.email,...renderEmail('taskAssigned',{recipientName:user.name,taskName:task.title,projectName:after.snapshot.title,dueAt:task.dueDate,priority:task.priority,url:`${process.env.APP_URL || 'http://localhost:5173'}/board/${after.id}`})});
  }
}
async function checkReminders(now=new Date()) {
  if(!mail.configured())return;
  await ensureTables();const projects=await db.query('SELECT * FROM naatzo_shared_projects');
  const personal=await readDb(); const items=personal.tasks.map(task=>({id:task.id,title:task.title,due:task.dueAt,completed:task.completed,userId:task.userId,scope:'personal'}));
  for(const project of projects.rows)for(const task of project.snapshot.tasks)items.push({id:task.id,title:task.title,due:task.dueDate,completed:task.column==='done',userId:project.snapshot.members.find(member=>member.id===task.assigneeId)?.userId,scope:project.id,projectTitle:project.snapshot.title});
  for(const task of items) {
    const due=new Date(task.due);if(task.completed||!task.userId||!task.due||Number.isNaN(due.getTime()))continue;
    const diff=due-now;const window=diff<=0?{key:'overdue'}:windows.filter(w=>diff<=w.ms).at(-1);if(!window)continue;
    const user=await recipient(task.userId);if(!user?.email)continue;
    const type=window.key==='overdue'?'deadlineOverdue':window.key==='1h'?'deadlineUrgent':'deadlineReminder';
    await mail.sendOnce(`reminder:${task.scope}:${task.id}:${due.toISOString()}:${window.key}:${task.userId}`,{to:user.email,...renderEmail(type,{recipientName:user.name,taskName:task.title,projectName:task.projectTitle,dueAt:due,url:`${process.env.APP_URL || 'http://localhost:5173'}/${task.scope==='personal'?'calendar':`board/${task.scope}`}`})});
  }
}
function startReminders() { if(!mail.configured())return;let running=false;const tick=async()=>{if(running)return;running=true;try{await checkReminders()}catch{console.error('[email] Falló la revisión de recordatorios.')}finally{running=false}};const timer=setInterval(tick,60000);timer.unref();tick();return timer; }
module.exports={checkReminders,startReminders,notifyAssignments};
