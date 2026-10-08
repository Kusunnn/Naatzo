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
  const id = crypto.randomUUID(); const snapshot = service.cleanSnapshot(req.body,req.user);
  const result = await db.query('INSERT INTO naatzo_shared_projects(id,owner_id,snapshot) VALUES($1,$2,$3) RETURNING *',[id,req.user.id,snapshot]);
  res.status(201).json({ project: service.view(result.rows[0]) });
}));
router.get('/projects/:id', asyncRoute(async (req,res) => res.json({ project: service.view(await service.readProject(req.params.id,req.user)) })));
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
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || /[\r\n]/.test(email))) throw new HttpError(400,'Correo inválido.');
  const count = await db.query('SELECT COUNT(*)::int AS total FROM naatzo_invitations WHERE project_id=$1 AND expires_at>NOW() AND NOT revoked',[project.id]);
  if (count.rows[0].total>=50) throw new HttpError(429,'Revoca una invitación anterior antes de crear más.');
  const token = crypto.randomBytes(32).toString('base64url');const id=crypto.randomUUID();
  const result = await db.query('INSERT INTO naatzo_invitations(id,project_id,token_hash,email,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL \'7 days\') RETURNING expires_at',[id,project.id,service.hash(token),email]);
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
