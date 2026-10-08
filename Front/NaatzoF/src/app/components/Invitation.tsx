import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Project, useProjects } from '../contexts/ProjectContext';
import { apiRequest } from '../services/api';

export function Invitation() {
  const { token } = useParams();
  const { user } = useAuth();
  const { importShared } = useProjects();
  const navigate = useNavigate();
  const [info,setInfo] = useState<{title:string; emailRestricted:boolean}>();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest<{title:string;emailRestricted:boolean}>(`/collaboration/invitations/${encodeURIComponent(token || '')}`).then(data => {if(active)setInfo(data);}).catch(e => {if(active)setError(e.message);});
    return () => {active=false;};
  },[token]);
  const loggedIn = user && sessionStorage.getItem('naatzo-token');
  return <div className="max-w-lg mx-auto p-8 my-12 bg-card border border-border rounded-2xl space-y-5">
    <h1 className="text-2xl font-bold">Invitación a Naatzo</h1>
    {error && <p role="alert">{error}</p>}
    {!info && !error && <p>Cargando invitación...</p>}
    {info && <><p>Te invitaron al proyecto <strong>{info.title}</strong>.</p>
      {info.emailRestricted && <p>Usa la cuenta del correo que recibió la invitación.</p>}
      {!loggedIn ? <div className="flex gap-4">
        {['/','/register'].map(path => <Link key={path} to={path} className="underline" onClick={() => sessionStorage.setItem('naatzo-invite-return',`/invite/${token}`)}>{path==='/'?'Iniciar sesión':'Crear cuenta'}</Link>)}
      </div> : <><p>Vas a unirte como {user.email}.</p><button disabled={busy} className="bg-primary text-primary-foreground px-5 py-3 rounded-lg" onClick={async () => {
        setBusy(true);setError('');
        try { const result = await apiRequest<{project:Project}>(`/collaboration/invitations/${token}/accept`,{method:'POST'}); const id=importShared(result.project); navigate(`/projects/${id}`); }
        catch(e) {setError(e instanceof Error?e.message:'No se pudo aceptar la invitación.');}
        finally {setBusy(false);}
      }}>Aceptar invitación</button></>}
    </>}
  </div>;
}
