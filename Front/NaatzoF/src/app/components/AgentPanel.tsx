import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import {
  Project,
  KanbanTask,
  useProjects,
} from "../contexts/ProjectContext";
import {
  AgentId,
  AgentStep,
  Run,
  agentApi,
  normalizeBoard,
  streamRun,
} from "../services/agents";
import { useRef } from 'react';
import { isSelfParticipant } from '../services/projectProgress';

const agents: { id: AgentId; title: string; description: string }[] = [
  {
    id: "analyst",
    title: "Analista",
    description: "Extrae objetivo, requisitos, stack y dudas de la minuta.",
  },
  {
    id: "planner",
    title: "Planificador",
    description: "Propone tareas y distribuye la carga del equipo.",
  },
  {
    id: "devops",
    title: "DevOps",
    description: "Prepara estructura, README, Docker y repositorio.",
  },
  {
    id: "notifier",
    title: "Notificador",
    description: "Comunica acuerdos y entregas al equipo.",
  },
];
const statuses: Record<string, string> = {
  queued: "En cola",
  analyzing: "Analizando",
  planning: "Planificando",
  awaiting_approval: "Plan pendiente de revisión",
  provisioning: "Preparando entorno",
  notifying: "Notificando",
  completed: "Completado",
  failed: "La ejecución falló",
  cancelled: "Cancelado",
};
export function AgentPanel({ project }: { project: Project }) {
  const { updateProject } = useProjects();
  const [run, setRun] = useState<Run>();
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const autoStarted = useRef<string | undefined>(undefined);
  const [progress, setProgress] = useState<Partial<Record<AgentId, string>>>({});
  const [streamRevision, setStreamRevision] = useState(0);
  const [llmMode, setLlmMode] = useState<string>();
  useEffect(() => {
    let active=true;
    agentApi.integrations().then(data=>{if(active)setLlmMode(data.integrations.llm.mode);}).catch(()=>{if(active)setLlmMode('unavailable');});
    return ()=>{active=false;};
  }, []);
  const [environment, setEnvironment] =
    useState<Awaited<ReturnType<typeof agentApi.environment>>>();
  const [workload, setWorkload] =
    useState<Awaited<ReturnType<typeof agentApi.board>>["workload"]>();
  const [confirmed, setConfirmed] = useState(false);
  const [remotePlan, setRemotePlan] = useState<KanbanTask[]>();
  function showPlan(board: Awaited<ReturnType<typeof agentApi.board>>) {
    const members=[...project.members];
    const columns=board.columns.map(column=>({...column,tasks:column.tasks.map(task=>{
      if(!task.assignee)return task;
      let member=isSelfParticipant(task.assignee.name) ? members.find(m=>m.userId===project.ownerUserId) : undefined;
      member ??= members.find(m=>m.id===task.assignee!.id || m.name.trim().toLowerCase()===task.assignee!.name.trim().toLowerCase());
      if(!member)return {...task,assigneeId:'',assignee:undefined};
      return {...task,assigneeId:member.id};
    })}));
    const tasks=normalizeBoard({...board,columns},project.id);
    setWorkload(board.workload);setRemotePlan(tasks);
    if(!project.tasks.length)updateProject(project.id,{tasks,members});
  }
  async function refresh() {
    if (!project.runId) return;
    const current = await agentApi.run(project.runId);
    setRun(current);
    setSteps(current.steps || []);
    if (
      project.remoteId &&
      ["awaiting_approval", "completed"].includes(current.status)
    ) {
      const board = await agentApi.board(project.remoteId);
      showPlan(board);
      if (current.status === "completed")
        setEnvironment(await agentApi.environment(project.remoteId));
    }
  }
  useEffect(() => {
    setRun(undefined);
    setProgress({});
    setSteps([]);
    setEnvironment(undefined);
    setWorkload(undefined);
    setRemotePlan(undefined);
    setError("");
    setConfirmed(false);
    if (!project.runId) return;
    const controller = new AbortController();
    agentApi
      .run(project.runId, controller.signal)
      .then((current) => {
        setRun(current);
        setSteps(current.steps || []);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    streamRun(
      project.runId,
      (event) => {
        if (event.type === "progress" && event.agent && event.message) {
          setProgress(previous => ({...previous, [event.agent!]: event.message}));
        }
        if (event.type === "step" && event.agent) {
          const step = {
            agent: event.agent,
            status: event.status,
            summary: event.summary,
            error: event.error,
          } as AgentStep;
          setSteps((prev) => [
            ...prev.filter((s) => s.agent !== step.agent),
            step,
          ]);
          if (event.status === "started")
            setRun({
              status: (
                {
                  analyst: "analyzing",
                  planner: "planning",
                  devops: "provisioning",
                  notifier: "notifying",
                } as const
              )[event.agent],
            });
          if (event.status === "failed")
            setRun({ status: "failed", error: event.error });
        }
        if (
          ["awaiting_approval", "completed", "failed", "cancelled"].includes(
            event.type,
          )
        ) {
          setRun({ status: event.type as Run["status"], error: event.error });
        }
      },
      controller.signal,
    ).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [project.runId, streamRevision]);
  useEffect(() => {
    if (
      !project.remoteId ||
      !run ||
      !["awaiting_approval", "completed"].includes(run.status)
    )
      return;
    let disposed = false;
    agentApi
      .board(project.remoteId)
      .then((board) => {
        if (disposed) return;
        showPlan(board);
      })
      .catch((err) => {
        if (!disposed) setError(err.message);
      });
    if (run.status === "completed")
      agentApi
        .environment(project.remoteId)
        .then((data) => {
          if (!disposed) setEnvironment(data);
        })
        .catch((err) => {
          if (!disposed) setError(err.message);
        });
    return () => {
      disposed = true;
    };
  }, [run?.status, project.remoteId]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    let remoteId = project.remoteId;
    let file: File | undefined;
    if(project.document) {
      const blob=await (await fetch(project.document.data)).blob();
      const name=project.document.name.replace(/\.md$/i,'.txt');
      file=new File([blob],name,{type:name.endsWith('.txt')?'text/plain':blob.type});
    }
    const existingRemote=Boolean(remoteId);
    if (!remoteId) {
      let teamId = project.teamId;
      if (!teamId) {
        const result = await agentApi.createTeam(project.title);
        teamId = result.team.id;
        updateProject(project.id, { teamId });
      }
      const synced = [...(project.syncedMemberIds || [])];
      for (const member of project.members) {
        if (synced.includes(member.id)) continue;
        await agentApi.addMember(teamId, {
          name: member.name,
          role: member.role,
          skills: member.skills.map((s) => s.trim()).filter(Boolean),
          weeklyHours: member.weeklyHours,
        });
        synced.push(member.id);
        updateProject(project.id, { syncedMemberIds: [...synced] });
      }
      const result = await agentApi.createProject({
        name: project.title,
        description: project.description,
        inputText: project.description,
        teamId,
        file,
      });
      remoteId = result.project.id;
      updateProject(project.id, { remoteId });
    }
    if (existingRemote && file) await agentApi.upload(remoteId, file, project.description);
    const result = await agentApi.start(remoteId, project.autoApprovePlan === true);
    const runId = result.runId || result.id;
    if (!runId) throw new Error("El backend no devolvió un runId válido.");
    updateProject(project.id, { remoteId, runId });
    setRun(result);
  }
  useEffect(() => {
    if (!project.autoStartAgents || project.runId || autoStarted.current === project.id) return;
    autoStarted.current = project.id;
    updateProject(project.id, { autoStartAgents: false });
    void action(start);
  }, [project.id, project.autoStartAgents, project.runId]);
  const active =
    run && !["failed", "completed", "cancelled"].includes(run.status);
  return (
    <div className="team-detail-grid">
      <section className="team-panel">
        <div className="flex items-center justify-between mb-5">
          <h2 className="flex items-center gap-2 !mb-0">
            <Bot className="text-primary" /> Asistentes del proyecto
          </h2>
          <span className="team-pill">
            {run ? statuses[run.status] || run.status : "Sin ejecutar"}
          </span>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          {project.autoApprovePlan
            ? 'Aprobación automática activada: los agentes continuarán con el entorno y los avisos sin pausar para revisar el plan.'
            : 'La minuta se envía al backend de Naatzo. Revisa el plan antes de autorizar la creación del entorno y los avisos.'}
        </p>
        {llmMode === 'mock' && <p role="status" className="text-sm p-3 mb-4 bg-secondary rounded-xl">Modo de demostración: los agentes generan ejemplos. Falta configurar la clave de IA en el servidor para analizar tu proyecto con el modelo real.</p>}
        {llmMode === 'unavailable' && <p role="status" className="team-error">No se pudo comprobar la conexión con los agentes.</p>}
        {agents.map((a) => {
          const step = steps.find((s) => s.agent === a.id);
          return (
            <div key={a.id} className={`team-agent ${step?.status || ""}`}>
              <div className="flex justify-between">
                <b>{a.title}</b>
                {step?.status === "done" ? (
                  <CheckCircle2 size={18} className="text-primary" />
                ) : step?.status === "started" ? (
                  <LoaderCircle
                    size={18}
                    className="animate-spin text-primary"
                  />
                ) : step?.status === "failed" ? (
                  <AlertCircle size={18} className="text-destructive" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Pendiente
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1" aria-live="polite">
                {step?.status === "started" ? progress[a.id] || step.summary || a.description : step?.summary || step?.error || a.description}
              </p>
            </div>
          );
        })}
        {error && (
          <p role="alert" className="team-error">
            {error}
          </p>
        )}
        {run?.error && <p className="team-error">{run.error}</p>}
        <div className="flex gap-3 flex-wrap">
          {!active && run?.status !== "completed" && (
            <button
              disabled={busy}
              className="team-primary"
              onClick={() => action(start)}
            >
              {busy ? "Conectando…" : "Ejecutar agentes"}
            </button>
          )}
          {project.runId && (
            <button
              disabled={busy}
              className="team-button"
              onClick={() => action(refresh)}
            >
              Actualizar estado y plan
            </button>
          )}
          {run?.status === "failed" && (
            <button
              disabled={busy}
              className="team-button"
              onClick={() =>
                action(async () => {
                  await agentApi.retry(
                    project.runId!,
                    [...steps].reverse().find((s) => s.status === "failed")?.agent ||
                      "analyst",
                  );
                  setStreamRevision((revision) => revision + 1);
                })
              }
            >
              Reintentar paso fallido
            </button>
          )}
          {active && (
            <button
              disabled={busy}
              className="team-button"
              onClick={() =>
                action(async () => {
                  await agentApi.cancel(project.runId!);
                  await refresh();
                })
              }
            >
              Cancelar ejecución
            </button>
          )}
        </div>
        {run?.status === "awaiting_approval" && (
          <div className="mt-6 p-4 bg-secondary rounded-xl">
            <h3 className="font-semibold">
              Revisa el tablero y la carga del equipo
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              La aprobación usa el plan del servidor que aparece abajo. Los
              cambios manuales del tablero se guardan en el proyecto compartido.
              Aprobar permite crear el repositorio y enviar avisos.
            </p>
            {remotePlan ? (
              <ul className="text-sm my-4 space-y-2">
                {remotePlan.map((t) => (
                  <li key={t.id} className="border-b border-border pb-2">
                    {t.title}{" "}
                    <span className="text-muted-foreground">
                      · {t.estimatedTime} · {t.priority}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-3">
                Actualiza para cargar el plan antes de aprobar.
              </p>
            )}
            <label className="flex gap-2 text-sm my-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Revisé el plan y autorizo continuar.
            </label>
            <button
              disabled={busy || !confirmed || !remotePlan}
              className="team-primary"
              onClick={() =>
                action(async () => {
                  await agentApi.approve(project.runId!);
                  setConfirmed(false);
                  await refresh();
                })
              }
            >
              Aprobar plan y continuar
            </button>
          </div>
        )}
      </section>
      <aside className="space-y-5">
        <section className="team-panel">
          <h2>Conexión con agentes</h2>
          <p className="text-sm text-muted-foreground">
            Los asistentes usan el backend de Naatzo y tu sesión actual.
            El plan generado se importa al tablero del proyecto.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Los modelos, GitHub y el canal de avisos se configuran en el
            servidor.
          </p>
        </section>
        {workload && (
          <section className="team-panel">
            <h2>Carga propuesta</h2>
            {workload.map((m) => (
              <div key={m.memberId} className="mb-4">
                <div className="flex justify-between text-sm">
                  <span>{m.name}</span>
                  <b className={m.percent > 100 ? "text-destructive" : ""}>
                    {m.percent}%
                  </b>
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.assignedHours} / {m.capacityHours} horas
                </p>
              </div>
            ))}
          </section>
        )}
        {environment && (
          <section className="team-panel">
            <h2 className="flex gap-2">
              <GitBranch size={18} /> Entorno generado
            </h2>
            {environment.repoUrl && /^https:\/\//.test(environment.repoUrl) && (
              <a
                href={environment.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-sm break-all"
              >
                Abrir repositorio
              </a>
            )}
            <ul className="text-sm text-muted-foreground mt-4">
              {environment.files?.map((f) => (
                <li key={typeof f === "string" ? f : f.path}>
                  {typeof f === "string" ? f : f.path}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
