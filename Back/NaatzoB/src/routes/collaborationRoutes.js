const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const service = require('../services/collaborationService');
const mail = require('../services/emailService');
const { renderEmail } = require('../services/emailTemplates');
const { HttpError } = require('../utils/httpError');
const router = express.Router();
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
router.get('/invitations/:token', asyncRoute(async (req,res) => {
  await service.ensureTables(); const result = await db.query('SELECT p.snapshot,i.email,i.expires_at FROM naatzo_invitations i JOIN naatzo_shared_projects p ON p.id=i.project_id WHERE token_hash=$1 AND NOT revoked AND expires_at>NOW()', [service.hash(req.params.token)]);
  if (!result.rows[0]) throw new HttpError(410,'La invitación expiró o fue revocada.');
  res.json({ title: result.rows[0].snapshot.title, expiresAt: result.rows[0].expires_at, emailRestricted: Boolean(result.rows[0].email) });
}));
router.use(service.requireSession);
router.get('/status', (req,res) => res.json({ emailConfigured: mail.configured() }));
router.get('/projects', asyncRoute(async (req,res) => {
  const result = await db.query(`SELECT * FROM naatzo_shared_projects WHERE owner_id=$1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'members') m WHERE m->>'userId'=$1)`, [req.user.id]);
  res.json({ projects: result.rows.map(service.view) });
}));
router.post('/projects', asyncRoute(async (req,res) => {
  // A client-generated UUID makes retries safe after a lost network response.
  const id = typeof req.body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.id) ? req.body.id : crypto.randomUUID();
  const snapshot = service.cleanSnapshot(req.body,req.user);
  const existing = await db.query('SELECT * FROM naatzo_shared_projects WHERE id=$1',[id]);
  if(existing.rows[0]) {
    const row=await service.readProject(id,req.user,true);
    return res.status(200).json({project:service.view(row)});
  }
  const result = await db.query('INSERT INTO naatzo_shared_projects(id,owner_id,snapshot) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING *',[id,req.user.id,snapshot]);
  const row = result.rows[0] || await service.readProject(id,req.user,true);
  res.status(result.rows.length ? 201 : 200).json({ project: service.view(row) });
}));
router.get('/projects/:id', asyncRoute(async (req,res) => res.json({ project: service.view(await service.readProject(req.params.id,req.user)) })));
router.post('/projects/:id/participants/:memberId/claim', asyncRoute(async (req,res)=>{
  const client=await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM naatzo_shared_projects WHERE id=$1 FOR UPDATE',[req.params.id]);
    const row=await service.readProject(req.params.id,req.user,false,client);
    const member=row.snapshot.members.find(m=>m.id===req.params.memberId);
    if(!member)throw new HttpError(404,'Participante no encontrado.');
    const reserved=await client.query('SELECT email FROM naatzo_invitations WHERE project_id=$1 AND member_id=$2 AND NOT revoked AND expires_at>NOW()',[row.id,member.id]);
    if(reserved.rows.some(invite=>invite.email&&invite.email!==req.user.email.toLowerCase()))throw new HttpError(409,'Este participante tiene una invitación para otro correo.');
    if((member.userId&&member.userId!==req.user.id)||(member.email&&member.email.toLowerCase()!==req.user.email.toLowerCase()))throw new HttpError(409,'Este participante corresponde a otra cuenta.');
    row.snapshot.members.filter(m=>m.id!==member.id&&m.userId===req.user.id).forEach(m=>{delete m.userId;delete m.email;});
    member.userId=req.user.id;member.email=req.user.email;
    const result=await client.query('UPDATE naatzo_shared_projects SET snapshot=$2,version=version+1 WHERE id=$1 RETURNING *',[row.id,row.snapshot]);
    await client.query('COMMIT');res.json({project:service.view(result.rows[0])});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));
router.patch('/projects/:id', asyncRoute(async (req,res) => {
  const current = await service.readProject(req.params.id,req.user); const version = Number(req.body.sharedVersion);
  if (!Number.isInteger(version)) throw new HttpError(400,'La versión del proyecto es obligatoria.');
  const snapshot = service.cleanSnapshot(req.body,req.user,current);
  const result = await db.query('UPDATE naatzo_shared_projects SET snapshot=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING *',[current.id,snapshot,version]);
  if (!result.rows[0]) throw new HttpError(409,'El equipo actualizó este proyecto. Actualiza los datos antes de sincronizar tus cambios.');
  res.json({ project: service.view(result.rows[0]) });
  // Schedule assignment notices after a successful save, without delaying the UI.
  require('../services/emailReminders').notifyAssignments(current, result.rows[0]).catch(() => console.error('[email] No se pudieron enviar avisos de asignación.'));
}));
router.get('/projects/:id/invitations', asyncRoute(async (req,res) => {
  await service.readProject(req.params.id,req.user,true);
  const result = await db.query('SELECT id,email,expires_at,revoked,accepted_by FROM naatzo_invitations WHERE project_id=$1 ORDER BY expires_at DESC',[req.params.id]);res.json({ invitations: result.rows });
}));
router.post('/projects/:id/invitations', asyncRoute(async (req,res) => {
  const project = await service.readProject(req.params.id,req.user,true);
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
  const memberId=req.body.memberId || null;
  if(memberId){
    const member=project.snapshot.members.find(m=>m.id===memberId);
    if(!member)throw new HttpError(404,'Participante no encontrado.');
    if(member.userId)throw new HttpError(409,'Este participante ya tiene una cuenta vinculada.');
    if(!email)throw new HttpError(400,'Indica el correo del participante.');
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || /[\r\n]/.test(email))) throw new HttpError(400,'Correo inválido.');
  const count = await db.query('SELECT COUNT(*)::int AS total FROM naatzo_invitations WHERE project_id=$1 AND expires_at>NOW() AND NOT revoked',[project.id]);
  if (count.rows[0].total>=50) throw new HttpError(429,'Revoca una invitación anterior antes de crear más.');
  const token = crypto.randomBytes(32).toString('base64url');const id=crypto.randomUUID();
  const result = await db.query('INSERT INTO naatzo_invitations(id,project_id,token_hash,email,member_id,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL \'7 days\') RETURNING expires_at',[id,project.id,service.hash(token),email,memberId]);
  const base = process.env.APP_URL || 'http://localhost:5173';
  const url = `${base.replace(/\/$/,'')}/invite/${token}`;
  let delivery = { sent:false, reason: email ? 'Correo no configurado. Comparte el enlace.' : 'Enlace creado.' };
  if (email) { try { delivery=await mail.sendEmail({to:email,...renderEmail('invitation',{inviterName:req.user.name,projectName:project.snapshot.title,expiresAt:result.rows[0].expires_at,url})}); } catch { delivery={sent:false,reason:'No se pudo enviar el correo. Puedes compartir el enlace o intentar otra invitación.'}; } }
  res.status(201).json({ id,url,email,expiresAt:result.rows[0].expires_at,delivery });
}));
router.delete('/projects/:id/invitations/:invitationId', asyncRoute(async (req,res) => {
  await service.readProject(req.params.id,req.user,true);await db.query('UPDATE naatzo_invitations SET revoked=TRUE WHERE id=$1 AND project_id=$2',[req.params.invitationId,req.params.id]);res.sendStatus(204);
}));
router.post('/invitations/:token/accept', asyncRoute(async (req,res) => res.json({ project: await service.acceptInvitation(req.params.token,req.user) })));
module.exports = router;
