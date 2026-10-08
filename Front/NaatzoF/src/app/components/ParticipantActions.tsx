import { useState } from 'react';
import { Mail, UserRoundCheck, X } from 'lucide-react';
import { Project, TeamMember, useProjects } from '../contexts/ProjectContext';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';

export function ParticipantActions({project,member,onClose}:{project:Project;member:TeamMember;onClose:()=>void}) {
  const {user}=useAuth();
  const {importShared,syncStatus}=useProjects();
  const [email,setEmail]=useState(member.email||'');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [url,setUrl]=useState('');
  const mine=member.userId===user?.id;
  const linked=Boolean(member.userId);
  const owner=project.ownerUserId===user?.id;
  const ready=Boolean(project.sharedId&&!project.syncPending&&syncStatus[project.id]?.state!=='saving');
  async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return <div className="team-modal-backdrop" onClick={onClose}>
    <section className="team-modal" role="dialog" aria-modal="true" aria-label={`Opciones de ${member.name}`} onClick={event=>event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3"><span className="team-avatar" style={{background:member.color}}>{member.initials}</span><h2 className="!mb-0">{member.name}</h2></div>
        <button type="button" className="team-button" aria-label="Cerrar opciones del participante" onClick={onClose}><X size={18}/></button>
      </div>
      {!ready&&<p className="text-sm text-muted-foreground mb-4">Espera a que el proyecto se guarde en el servidor. Si hubo un error, reintenta el guardado.</p>}
      {linked?<p className="text-sm mb-4">{mine?'Este participante eres tú. Sus tareas aparecen en tu calendario.':'Este participante ya tiene una cuenta vinculada.'}</p>:<>
        <p className="text-sm text-muted-foreground mb-4">Vincula este participante contigo para ver sus tareas como tuyas, o invítalo con su correo.</p>
        <button type="button" className="team-button mb-5" disabled={busy||!ready||!user} onClick={()=>act(async()=>{
          const result=await apiRequest<{project:Project}>(`/collaboration/projects/${project.sharedId}/participants/${encodeURIComponent(member.id)}/claim`,{method:'POST'});
          importShared(result.project,project.id);setMessage('Ya eres este participante. Sus tareas están vinculadas a tu cuenta.');
        })}><UserRoundCheck size={17}/> Este soy yo</button>
        {owner&&<form className="team-form" onSubmit={event=>{event.preventDefault();act(async()=>{
          const result=await apiRequest<{url:string;delivery:{sent:boolean;reason?:string}}>(`/collaboration/projects/${project.sharedId}/invitations`,{method:'POST',body:{email:email.trim(),memberId:member.id}});
          setUrl(result.url);setMessage(result.delivery.sent?'Invitación enviada. Al aceptarla, su cuenta quedará vinculada a este participante y sus tareas.':result.delivery.reason||'Puedes compartir el enlace de invitación.');
        });}}>
          <label>Correo de {member.name}<input autoFocus required type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} placeholder="integrante@correo.com"/></label>
          <button className="team-primary" disabled={busy||!ready}><Mail size={17}/> {busy?'Procesando…':'Enviar invitación'}</button>
        </form>}
        {!owner&&<p className="text-sm text-muted-foreground">El propietario del proyecto puede enviar invitaciones.</p>}
      </>}
      {message&&<p role="status" className="text-sm mt-4">{message}</p>}
      {url&&<label className="block text-sm mt-4">También puedes compartir este enlace con el destinatario<input aria-label="Enlace del participante" readOnly value={url} onFocus={event=>event.target.select()} className="w-full border border-border rounded-lg p-2 mt-2 bg-background"/></label>}
    </section>
  </div>;
}
