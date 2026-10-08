import { useState } from 'react';
import { Project, useProjects } from '../contexts/ProjectContext';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import { Link } from 'react-router';

export function ProjectInvitations({ project }: { project: Project }) {
  const { user } = useAuth();
  const { importShared, syncStatus, retrySync } = useProjects();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const owner = !project.ownerUserId || project.ownerUserId === user?.id;
  const loggedIn = Boolean(sessionStorage.getItem('naatzo-token'));
  const saving = syncStatus[project.id]?.state==='saving' || project.syncPending;
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (project.sharedId) return project;
    const { project: shared } = await apiRequest<{project: Project}>('/collaboration/projects', {method: 'POST', body: project});
    importShared(shared, project.id); return shared;
  }
  async function invite(address?: string) {
    const shared = await publish();
    const result = await apiRequest<{url: string; delivery: {sent: boolean; reason?: string}}>(`/collaboration/projects/${shared.sharedId}/invitations`, {method: 'POST',body: {email: address}});
    setUrl(result.url);
    setMessage(result.delivery.sent ? 'Invitación enviada por correo. El enlace vence en 7 días.' : result.delivery.reason || 'Enlace creado.');
  }
  return <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
    <h2 className="font-semibold text-lg">Invitaciones y proyecto compartido</h2>
    <p className="text-sm text-muted-foreground">Los cambios se guardan automáticamente en el servidor. Actualiza para recibir los cambios del equipo.</p>
    {syncStatus[project.id] && <p role="status">{syncStatus[project.id].message}</p>}
    {syncStatus[project.id]?.state==='error' && <button className="underline" onClick={()=>retrySync(project.id)}>Reintentar guardado</button>}
    {!loggedIn ? <p>Para compartir, <Link to="/" className="text-primary underline">inicia sesión de nuevo</Link>.</p> : <>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || syncStatus[project.id]?.state==='saving'} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg" onClick={() => run(async () => {
          if (!project.sharedId) { await publish(); } else {
            const result = await apiRequest<{project: Project}>(`/collaboration/projects/${project.sharedId}`, {method:'PATCH',body:project});
            importShared(result.project,project.id);
          }
          setMessage('Proyecto sincronizado con el equipo.');
        })}>Sincronizar cambios</button>
        {project.sharedId && <button disabled={busy || syncStatus[project.id]?.state==='saving'} className="px-4 py-2 border border-border rounded-lg" onClick={() => {
          if (!confirm('Se reemplazarán los cambios locales por la versión compartida. ¿Continuar?')) return;
          run(async () => { const result = await apiRequest<{project:Project}>(`/collaboration/projects/${project.sharedId}`); importShared(result.project,project.id);setMessage('Datos actualizados desde el equipo.'); });
        }}>Actualizar del equipo</button>}
      </div>
      {owner && <form className="flex flex-wrap gap-3" onSubmit={event => {event.preventDefault();run(() => invite(email.trim()));}}>
        <input aria-label="Correo del integrante" required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="integrante@correo.com" className="bg-background border border-border rounded-lg p-2 flex-1 min-w-0" />
        <button disabled={busy || saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Enviar invitación</button>
      </form>}
      {owner && <button disabled={busy || saving} className="underline" onClick={() => run(() => invite())}>Crear enlace de invitación</button>}
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {url && <label className="block text-sm">Enlace para compartir<input aria-label="Enlace de invitación" readOnly value={url} onFocus={e => e.target.select()} className="block w-full bg-background border border-border rounded-lg p-2 mt-2" /></label>}
  </section>;
}
