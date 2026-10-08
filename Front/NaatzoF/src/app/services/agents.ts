import { API_BASE_URL } from "./api";
import { KanbanTask } from "../contexts/ProjectContext";
const AGENT_BASE_URL=`${API_BASE_URL}/team`;

// Contract from Naatzo_Backendasdasd.pdf. Models and provider keys stay on the server.
export type AgentId = "analyst" | "planner" | "devops" | "notifier";
export type RunStatus =
  | "queued"
  | "analyzing"
  | "planning"
  | "awaiting_approval"
  | "provisioning"
  | "notifying"
  | "completed"
  | "failed"
  | "cancelled";
export interface AgentStep {
  agent: AgentId;
  status: "started" | "done" | "failed";
  summary?: string;
  error?: string;
}
export interface Run {
  id?: string;
  runId?: string;
  status: RunStatus;
  steps?: AgentStep[];
  error?: string;
}
export interface AgentEvent {
  type: string;
  agent?: AgentId;
  status?: AgentStep["status"];
  summary?: string;
  runId?: string;
  error?: string;
}
interface BoardTask {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assignee?: { id: string; name: string };
  estimateHours?: number;
  priority?: "high" | "medium" | "low" | KanbanTask["priority"];
  plannedEnd?: string;
  acceptanceCriteria?: { id?: string; title: string; completed?: boolean }[];
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("naatzo-token");
  const response = await fetch(`${AGENT_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || `No se pudo conectar con los agentes (${response.status}).`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const agentApi = {
  createTeam: (name: string) =>
    request<{ team: { id: string } }>("/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  addMember: (
    teamId: string,
    member: {
      name: string;
      role: string;
      skills: string[];
      weeklyHours: number;
    },
  ) =>
    request(`/teams/${encodeURIComponent(teamId)}/members`, {
      method: "POST",
      body: JSON.stringify(member),
    }),
  createProject: (data: {
    name: string;
    description: string;
    teamId: string;
    inputText: string;
    file?: File;
  }) =>
    request<{ project: { id: string } }>("/projects", {
      method: "POST",
      body: data.file ? (() => {const form=new FormData();form.append('name',data.name);form.append('teamId',data.teamId);form.append('inputText',data.inputText);form.append('file',data.file);return form;})() : JSON.stringify(data),
    }),
  upload: (id: string, file: File, comments = '') => {
    const form = new FormData();
    form.append("file", file);
    form.append('inputText',comments);
    return request(`/projects/${encodeURIComponent(id)}/document`, {
      method: "POST",
      body: form,
    });
  },
  start: (id: string) =>
    request<Run>(`/projects/${encodeURIComponent(id)}/runs`, {
      method: "POST",
      body: JSON.stringify({ requireApproval: true }),
    }),
  run: async (id: string, signal?: AbortSignal) => {
    const result=await request<{run:Run;steps:AgentStep[]}>(`/runs/${encodeURIComponent(id)}`, {signal});
    return {...result.run,steps:result.steps};
  },
  integrations: () => request<{integrations:{llm:{mode:string}}}>('/health/integrations'),
  approve: (id: string) =>
    request(`/runs/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  retry: (id: string, from: AgentId) =>
    request(`/runs/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      body: JSON.stringify({ from }),
    }),
  cancel: (id: string) =>
    request(`/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  board: async (id: string) => {
    const result=await request<{
      lists: { stage: string; cards: (BoardTask & {checklist?:{total:number}})[] }[];
      workload?: {
        memberId: string;
        name: string;
        assignedHours: number;
        capacityHours: number;
        percent: number;
      }[];
    }>(`/projects/${encodeURIComponent(id)}/board`);
    const columns=await Promise.all(result.lists.map(async list=>({key:list.stage,tasks:await Promise.all(list.cards.map(async card=>{
      if(!card.checklist?.total)return card;
      const detail=await request<{task:{checklistItems:{id:string;text:string;done:boolean}[]}}>(`/tasks/${encodeURIComponent(card.id)}`);
      return {...card,acceptanceCriteria:detail.task.checklistItems.map(item=>({id:item.id,title:item.text,completed:item.done}))};
    }))})));
    return {columns,workload:result.workload};
  },
  environment: (id: string) =>
    request<{ repoUrl?: string; files?: (string | { path: string })[] }>(
      `/projects/${encodeURIComponent(id)}/environment`,
    ),
};
export function normalizeBoard(
  board: Awaited<ReturnType<typeof agentApi.board>>,
  projectId: string,
): KanbanTask[] {
  const priorityMap: Record<string, KanbanTask["priority"]> = {
    high: "alta",
    medium: "media",
    low: "baja",
    alta: "alta",
    media: "media",
    baja: "baja",
  };
  const columnMap: Record<string, KanbanTask["column"]> = {
    todo: "todo",
    in_progress: "in-progress",
    "in-progress": "in-progress",
    review: "review",
    done: "done",
  };
  return board.columns.flatMap((c) =>
    c.tasks.map((t) => ({
      id: String(t.id),
      projectId,
      title: t.title,
      description: t.description || "",
      assigneeId: String(t.assigneeId || t.assignee?.id || ""),
      priority: priorityMap[t.priority || "medium"] || "media",
      estimatedTime: `${t.estimateHours || 0}h`,
      column: columnMap[c.key] || "todo",
      acceptanceCriteria: t.acceptanceCriteria?.map((item, index) => ({
        id: item.id || `${t.id}-criterion-${index}`,
        title: item.title,
        completed: Boolean(item.completed),
      })),
      dueDate: t.plannedEnd
        ? new Date(`${t.plannedEnd.slice(0, 10)}T12:00:00`)
        : undefined,
    })),
  );
}
export async function streamRun(
  id: string,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  const token = sessionStorage.getItem("naatzo-token");
  const response = await fetch(
    `${AGENT_BASE_URL}/runs/${encodeURIComponent(id)}/events`,
    {
      signal,
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok || !response.body)
    throw new Error(
      "No se pudo recibir el avance. Usa Actualizar para recuperar el estado.",
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const lines = block.split(/\r?\n/);
        const type =
          lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim() || "message";
        const data = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data) onEvent({ ...JSON.parse(data), type });
      }
    }
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
