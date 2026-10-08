import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {useNavigate} from 'react-router';
import {Project,useProjects} from '../contexts/ProjectContext';
import {useAuth} from '../contexts/AuthContext';

export function DeleteProjectButton({project}:{project:Project}){
  const {user}=useAuth();
  const {deleteProject,syncStatus}=useProjects();
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  if(project.ownerUserId&&project.ownerUserId!==user?.id)return null;
  return <>
    <button type="button" className="team-button !text-destructive" disabled={syncStatus[project.id]?.state==='saving'} onClick={()=>{setError('');setOpen(true);}}><Trash2 size={17}/> Eliminar proyecto</button>
    {open&&<div className="team-modal-backdrop"><section className="team-modal" role="dialog" aria-modal="true" aria-label="Eliminar proyecto">
      <h2>¿Eliminar «{project.title}»?</h2>
      <p className="text-sm text-muted-foreground mb-5">Se eliminarán el proyecto, su documento, sus tareas y sus invitaciones. El equipo dejará de verlo. Esta acción no se puede deshacer.</p>
      {error&&<p role="alert" className="team-error">{error}</p>}
      <div className="flex flex-wrap gap-3 justify-end">
        <button type="button" autoFocus className="team-button" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>
        <button type="button" className="team-button !bg-destructive !text-white" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await deleteProject(project.id);navigate('/projects');}catch(err){setError((err as Error).message);setBusy(false);}}}>{busy?'Eliminando…':'Sí, eliminar proyecto'}</button>
      </div>
    </section></div>}
  </>;
}
