import { Link } from 'react-router';
import { Project, useProjects } from '../contexts/ProjectContext';

export function ProjectSaveStatus({project}:{project:Project}) {
  const {syncStatus,retrySync}=useProjects();
  const status=syncStatus[project.id];
  const message=status?.message || (project.sharedId&&!project.syncPending?'Guardado en el servidor':'Pendiente de guardar en el servidor');
  return <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground my-3" role="status" aria-live="polite">
    <span>{message}</span>
    {status?.state==='error' && <button className="text-primary underline" onClick={()=>retrySync(project.id)}>Reintentar guardado</button>}
    {status?.state==='conflict' && <Link className="text-primary underline" to={`/projects/${project.id}`}>Revisa la versión compartida en Equipo y documentos</Link>}
  </div>;
}
