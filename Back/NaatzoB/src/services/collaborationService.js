const crypto = require('crypto');
const db = require('../db/postgres');
const { HttpError } = require('../utils/httpError');
let init;
async function ensureTables() {
  if (!init) init = db.query(`
    CREATE TABLE IF NOT EXISTS naatzo_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
    CREATE TABLE IF NOT EXISTS naatzo_shared_projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, snapshot JSONB NOT NULL, version INT NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS naatzo_invitations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES naatzo_shared_projects(id), token_hash TEXT UNIQUE NOT NULL, email TEXT, expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT FALSE, accepted_by TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]);
    CREATE TABLE IF NOT EXISTS naatzo_email_log (key TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `).catch(error => { init = null; throw error; });
  await init;
}
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
async function createSession(userId) {
  await ensureTables(); const token = crypto.randomBytes(32).toString('base64url');
  await db.query('INSERT INTO naatzo_sessions VALUES ($1,$2,NOW()+INTERVAL \'7 days\')', [hash(token), userId]); return token;
}
async function requireSession(req, res, next) {
  try {
    await ensureTables(); const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new HttpError(401, 'Inicia sesión de nuevo para usar invitaciones.');
    if(token.split('.').length===3) {
      const {requireAuth}=require('../modules/team/middleware/auth');
      return requireAuth(req,res,async()=>{
        try {
          const result=await db.query('SELECT id,name,email FROM naatzo_users WHERE id::text=$1',[req.user.id]);
          if(!result.rows[0])throw new HttpError(401,'La cuenta ya no está disponible.');
          req.user=result.rows[0];next();
        }catch(error){next(error);}
      });
    }
    const result = await db.query('SELECT u.id,u.name,u.email FROM naatzo_sessions s JOIN naatzo_users u ON u.id::text=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()', [hash(token)]);
    if (!result.rows[0]) throw new HttpError(401, 'La sesión expiró. Inicia sesión de nuevo.');
    req.user = result.rows[0]; next();
  } catch (error) { next(error); }
}
function canRead(project, userId) { return project.owner_id === userId || project.snapshot.members.some(member => member.userId === userId); }
async function readProject(id, user, ownerOnly = false, client = db) {
  const result = await client.query('SELECT * FROM naatzo_shared_projects WHERE id=$1', [id]); const row = result.rows[0];
  if (!row || !(ownerOnly ? row.owner_id === user.id : canRead(row, user.id))) throw new HttpError(404, 'Proyecto no disponible para tu cuenta.');
  return row;
}
function view(row) { return { ...row.snapshot, tasks: row.snapshot.tasks.map(task => ({...task,projectId:row.id})), id: row.id, sharedId: row.id, ownerUserId: row.owner_id, sharedVersion: row.version }; }
function cleanSnapshot(input, user, current) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || !Array.isArray(input.tasks) || !Array.isArray(input.members) || input.tasks.length > 500 || input.members.length > 100) throw new HttpError(400, 'Datos del proyecto inválidos.');
  const ids = new Set();
  for (const member of input.members) {
    if (!member || typeof member.id !== 'string' || !member.id || ids.has(member.id) || typeof member.name !== 'string' || !member.name.trim() || !Array.isArray(member.skills)) throw new HttpError(400, 'Integrante inválido o duplicado.');
    ids.add(member.id);
  }
  const taskIds = new Set();
  for (const task of input.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || taskIds.has(task.id) || typeof task.title !== 'string' || !task.title.trim() || !['todo','first-tasks','in-progress','review','done'].includes(task.column) || !['alta','media','baja'].includes(task.priority) || (task.assigneeId && !ids.has(task.assigneeId)) || (task.dueDate && Number.isNaN(new Date(task.dueDate).getTime()))) throw new HttpError(400, 'Actividad inválida o duplicada.');
    taskIds.add(task.id);
    if (task.acceptanceCriteria !== undefined) {
      const criteriaIds = new Set();
      if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length > 200) throw new HttpError(400, 'Criterios inválidos.');
      for (const item of task.acceptanceCriteria) {
        if (!item || typeof item.id !== 'string' || !item.id || criteriaIds.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || typeof item.completed !== 'boolean') throw new HttpError(400, 'Criterio inválido o duplicado.');
        criteriaIds.add(item.id);
      }
      if (task.column === 'done' && task.acceptanceCriteria.some(item => !item.completed)) throw new HttpError(400, 'Completa los criterios antes de finalizar la actividad.');
    }
  }
  const snapshot = { title: input.title.trim().slice(0,100), description: String(input.description || '').slice(0,30000), createdAt: input.createdAt || new Date().toISOString(), tasks: input.tasks, members: input.members.map(member => {
    const trusted = current?.snapshot.members.find(existing => existing.id === member.id);
    return { ...member, userId: trusted?.userId || (member.userId === user.id ? user.id : undefined), email: trusted?.email || (member.userId === user.id ? user.email : undefined) };
  }) };
  if(input.document !== undefined) {
    const document=input.document;
    if(!document || typeof document.name!=='string' || !/\.(pdf|docx|txt|md)$/i.test(document.name) || typeof document.data!=='string' || !/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(document.data))throw new HttpError(400,'Documento inválido.');
    const encoded=document.data.slice(document.data.indexOf(',')+1);
    if(Buffer.from(encoded,'base64').length>2*1024*1024)throw new HttpError(413,'El documento debe pesar como máximo 2 MB.');
    snapshot.document={name:document.name.slice(0,255),data:document.data};
  }else if(current?.snapshot.document) snapshot.document=current.snapshot.document;
  // Agent identifiers are persisted for the owner's next session. Access to
  // those resources is still checked independently by the team API.
  for(const field of ['remoteId','runId','teamId']) {
    const value=current && current.owner_id!==user.id ? current.snapshot[field] : input[field] || current?.snapshot[field];
    if(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))snapshot[field]=value;
  }
  const synced=current && current.owner_id!==user.id ? current.snapshot.syncedMemberIds : input.syncedMemberIds || current?.snapshot.syncedMemberIds;
  if(Array.isArray(synced))snapshot.syncedMemberIds=synced.filter(id=>typeof id==='string'&&id.length<=100).slice(0,100);
  // Preserve members who accepted an invitation, even if the owner's local snapshot is older.
  current?.snapshot.members.filter(member => member.userId && !snapshot.members.some(m => m.id === member.id)).forEach(member => snapshot.members.push(member));
  if (!snapshot.members.some(member => member.userId === user.id) && !current) snapshot.members.push({ id: crypto.randomUUID(), name: user.name, userId: user.id, email: user.email, initials: user.name[0], color: 'var(--primary)', role: 'Propietario', skills: [], weeklyHours: 20 });
  if (JSON.stringify({...snapshot,document:undefined}).length > 1_000_000) throw new HttpError(413, 'El proyecto es demasiado grande para compartir.');
  return snapshot;
}
async function acceptInvitation(token, user) {
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM naatzo_invitations WHERE token_hash=$1 FOR UPDATE', [hash(token)]); const invite = result.rows[0];
    if (!invite || invite.revoked || new Date(invite.expires_at) <= new Date()) throw new HttpError(410, 'La invitación expiró o fue revocada.');
    if (invite.email && invite.email !== user.email.toLowerCase()) throw new HttpError(403, 'Esta invitación corresponde a otro correo.');
    if (invite.email && invite.accepted_by.length && !invite.accepted_by.includes(user.id)) throw new HttpError(410, 'La invitación ya fue utilizada.');
    if (invite.accepted_by.length >= 100 && !invite.accepted_by.includes(user.id)) throw new HttpError(410, 'El enlace alcanzó su límite de participantes.');
    const projects = await client.query('SELECT * FROM naatzo_shared_projects WHERE id=$1 FOR UPDATE', [invite.project_id]); const row = projects.rows[0];
    if (!canRead(row, user.id)) {
      const members = row.snapshot.members; const member = members.find(m => !m.userId && (m.email?.toLowerCase() === user.email.toLowerCase() || m.name.trim().toLowerCase() === user.name.trim().toLowerCase()));
      if (member) { member.userId = user.id; member.email = user.email; } else members.push({ id: crypto.randomUUID(), userId: user.id, email: user.email, name: user.name, initials: user.name[0], color: 'var(--primary)', role: 'Integrante', skills: [], weeklyHours: 20 });
      row.version += 1;
      await client.query('UPDATE naatzo_shared_projects SET snapshot=$2,version=$3 WHERE id=$1', [row.id, row.snapshot, row.version]);
    }
    if (!invite.accepted_by.includes(user.id)) await client.query('UPDATE naatzo_invitations SET accepted_by=array_append(accepted_by,$2) WHERE id=$1', [invite.id,user.id]);
    await client.query('COMMIT'); return view(row);
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
module.exports = { ensureTables, hash, createSession, requireSession, readProject, view, cleanSnapshot, acceptInvitation, canRead };
