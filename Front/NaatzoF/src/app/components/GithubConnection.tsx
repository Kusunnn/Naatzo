import { useEffect, useState } from 'react';
import { agentApi } from '../services/agents';
import { useAuth } from '../contexts/AuthContext';

export function GithubConnection() {
  const { user } = useAuth();
  const [status,setStatus] = useState<Awaited<ReturnType<typeof agentApi.githubStatus>>>();
  const [authorization,setAuthorization] = useState<Awaited<ReturnType<typeof agentApi.connectGithub>>>();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(()=>{
    let active=true;
    setStatus(undefined);setAuthorization(undefined);setMessage('');
    agentApi.githubStatus().then(result=>{if(active)setStatus(result);}).catch(()=>{if(active)setMessage('No se pudo consultar la conexión de GitHub.');});
    return ()=>{active=false;};
  },[user?.id]);
  async function act(action:()=>Promise<void>){
    setBusy(true);setMessage('');
    try{await action();}catch(error){setMessage(error instanceof Error?error.message:'No se pudo conectar GitHub.');}finally{setBusy(false);}
  }
  return <section className="mb-5 text-sm" aria-label="Conexión de GitHub">
    <p className="mb-2">{status?.connected ? `GitHub conectado: ${status.login}` : 'GitHub: conecta la cuenta del propietario antes de aprobar el plan.'}</p>
    <p className="text-muted-foreground mb-2">Se creará un repositorio público al aprobar. La conexión dura hasta 8 horas y se pierde si reinicias el backend. Autorizar permite gestionar repositorios públicos de tu cuenta.</p>
    {!status?.available && status && <p>Falta configurar GITHUB_CLIENT_ID y habilitar Device flow en la OAuth App.</p>}
    {status?.available && !status.connected && <button type="button" className="team-button" disabled={busy} onClick={()=>act(async()=>{setAuthorization(await agentApi.connectGithub());})}>Conectar GitHub</button>}
    {authorization && !status?.connected && <div className="mt-3">
      <p>Copia este código: <strong>{authorization.userCode}</strong></p>
      <a className="underline" href={authorization.verificationUrl} target="_blank" rel="noopener noreferrer">Abrir GitHub para autorizar</a>
      <button type="button" className="team-button mt-2" disabled={busy} onClick={()=>act(async()=>{
        const result=await agentApi.completeGithub();
        if(result.pending){setMessage(result.message || 'Autorización pendiente.');return;}
        setStatus(await agentApi.githubStatus());setAuthorization(undefined);
      })}>Ya autoricé, comprobar conexión</button>
    </div>}
    {status?.connected && <button type="button" className="team-button" disabled={busy} onClick={()=>act(async()=>{await agentApi.disconnectGithub();setStatus(await agentApi.githubStatus());})}>Desconectar de Naatzo</button>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}
