import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { tasksProgress } from "../services/projectProgress";
import { apiRequest } from '../services/api';

export type KanbanColumn = "todo" | "in-progress" | "review" | "done";
export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  skills: string[];
  weeklyHours: number;
  userId?: string;
  email?: string;
}
export interface AcceptanceCriterion {
  id: string;
  title: string;
  completed: boolean;
}
export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  priority: "alta" | "media" | "baja";
  assigneeId: string;
  estimatedTime: string;
  column: KanbanColumn;
  projectId: string;
  dueDate?: Date;
  acceptanceCriteria?: AcceptanceCriterion[];
}
export interface Project {
  sharedId?: string;
  ownerUserId?: string;
  sharedVersion?: number;
  id: string;
  title: string;
  description: string;
  members: TeamMember[];
  tasks: KanbanTask[];
  createdAt: Date;
  document?: { name: string; data: string };
  remoteId?: string;
  runId?: string;
  teamId?: string;
  syncedMemberIds?: string[];
}
export const columns: { key: KanbanColumn; label: string }[] = [
  { key: "todo", label: "Por hacer" },
  { key: "in-progress", label: "En progreso" },
  { key: "review", label: "En revisión" },
  { key: "done", label: "Completado" },
];
const palette = ["var(--primary)", "#7c6cdb", "#299e83", "#d27b46"];
export function makeMember(name: string, i: number): TeamMember {
  return {
    id: crypto.randomUUID(),
    name,
    initials: name
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    color: palette[i % palette.length],
    role: "Integrante",
    skills: [],
    weeklyHours: 20,
  };
}
function load(key: string): Project[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]").map((p: Project) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      tasks: p.tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
      })),
    }));
  } catch {
    return [];
  }
}
interface ContextValue {
  importShared: (project: Project, localId?: string) => string;
  projects: Project[];
  addProject: (
    p: Pick<Project, "title" | "description" | "members" | "document">,
  ) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  addTask: (id: string, task: Omit<KanbanTask, "id" | "projectId">) => void;
  moveTask: (projectId: string, taskId: string, column: KanbanColumn) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  setAcceptanceCriteria: (
    projectId: string,
    taskId: string,
    items: AcceptanceCriterion[],
  ) => void;
  getProgress: (p: Project) => number;
  getMemberById: (id: string) => TeamMember | undefined;
  storageError: string;
}
const Context = createContext<ContextValue | undefined>(undefined);
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = `naatzo-projects-v1-${user?.id || "guest"}`;
  const [store, setStore] = useState(() => ({ key, projects: load(key) }));
  const [storageError, setStorageError] = useState("");
  const projects = store.key === key ? store.projects : load(key);
  useEffect(() => {
    setStore({ key, projects: load(key) });
    setStorageError("");
    let active = true;
    if (user && sessionStorage.getItem('naatzo-token')) {
      apiRequest<{projects: Project[]}>('/collaboration/projects').then(result => {
        if (!active || !Array.isArray(result.projects)) return;
        setStore(prev => {
          const local = prev.key === key ? prev.projects : load(key);
          const additions = result.projects.filter(p => !local.some(existing => existing.sharedId === p.sharedId)).map(p => ({...p, createdAt:new Date(p.createdAt),tasks:p.tasks.map(t => ({...t,dueDate:t.dueDate?new Date(t.dueDate):undefined}))}));
          const next = [...local,...additions];
          try {localStorage.setItem(key,JSON.stringify(next));} catch {setStorageError('No se pudo guardar el proyecto compartido en este navegador.');}
          return {key,projects:next};
        });
      }).catch(() => {if(active)setStorageError('No se pudieron consultar los proyectos compartidos. Inicia sesión de nuevo o comprueba la conexión.');});
    }
    return () => {active=false;};
  }, [key]);
  const save = (fn: (prev: Project[]) => Project[]) =>
    setStore((prev) => {
      const next = fn(prev.key === key ? prev.projects : load(key));
      try {
        localStorage.setItem(key, JSON.stringify(next));
        setStorageError("");
      } catch {
        setStorageError(
          "No se pudo guardar en este navegador. Libera espacio o usa un documento más pequeño antes de recargar.",
        );
      }
      return { key, projects: next };
    });
  const updateProject = (id: string, patch: Partial<Project>) =>
    save((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const importShared = (project: Project, localId?: string) => {
    const id = localId || projects.find(p => p.sharedId === project.sharedId)?.id || project.id;
    const parsed = { ...project, id, createdAt: new Date(project.createdAt), tasks: project.tasks.map(t => ({...t, projectId: id, dueDate: t.dueDate ? new Date(t.dueDate) : undefined})) };
    save(ps => ps.some(p => p.id === id) ? ps.map(p => p.id === id ? {...p,...parsed} : p) : [...ps,parsed]);
    return id;
  };
  const addProject: ContextValue["addProject"] = (data) => {
    const id = crypto.randomUUID();
    save((ps) => [...ps, { ...data, id, createdAt: new Date(), tasks: [] }]);
    return id;
  };
  const addTask: ContextValue["addTask"] = (id, task) =>
    save((ps) =>
      ps.map((p) =>
        p.id === id
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { ...task, id: crypto.randomUUID(), projectId: id },
              ],
            }
          : p,
      ),
    );
  const moveTask: ContextValue["moveTask"] = (id, taskId, column) =>
    save((ps) =>
      ps.map((p) =>
        p.id === id
          ? {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id === taskId &&
                !(
                  column === "done" &&
                  t.acceptanceCriteria?.some((item) => !item.completed)
                )
                  ? { ...t, column }
                  : t,
              ),
            }
          : p,
      ),
    );
  const deleteTask: ContextValue["deleteTask"] = (id, taskId) =>
    save((ps) =>
      ps.map((p) =>
        p.id === id
          ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
          : p,
      ),
    );
  const setAcceptanceCriteria: ContextValue["setAcceptanceCriteria"] = (
    id,
    taskId,
    items,
  ) =>
    save((ps) =>
      ps.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              tasks: p.tasks.map((task) => {
                if (task.id !== taskId) return task;
                const allDone =
                  items.length > 0 && items.every((item) => item.completed);
                return {
                  ...task,
                  acceptanceCriteria: items,
                  column: !items.length
                    ? task.column
                    : allDone
                      ? "done"
                      : task.column === "done"
                        ? "in-progress"
                        : task.column,
                };
              }),
            },
      ),
    );
  return (
    <Context.Provider
      value={{
        projects,
        importShared,
        addProject,
        updateProject,
        addTask,
        moveTask,
        deleteTask,
        setAcceptanceCriteria,
        storageError,
        getProgress: (p) => tasksProgress(p.tasks),
        getMemberById: (id) =>
          projects.flatMap((p) => p.members).find((m) => m.id === id),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useProjects() {
  const value = useContext(Context);
  if (!value) throw new Error("ProjectProvider requerido");
  return value;
}
