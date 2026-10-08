import { useState, FormEvent } from "react";
import { Link, useParams, useLocation } from "react-router";
import {
  ArrowLeft,
  Plus,
  Search,
  CalendarDays,
  FileText,
  Trash2,
  Users,
  Clock,
} from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  columns,
  KanbanColumn,
  KanbanTask,
  makeMember,
  useProjects,
} from "../contexts/ProjectContext";
import { AgentPanel } from "./AgentPanel";
import { ProjectInvitations } from './ProjectInvitations';
import { ProjectSaveStatus } from './ProjectSaveStatus';
import { AcceptanceChecklist } from "./AcceptanceChecklist";
import { useAuth } from "../contexts/AuthContext";
import { linkMember, myMemberId } from "../services/projectProgress";
import "./team.css";

export function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isBoardPage = useLocation().pathname.startsWith("/board/");
  const {
    projects,
    addTask,
    moveTask,
    deleteTask,
    updateProject,
    getProgress,
    storageError,
  } = useProjects();
  const project = projects.find((p) => p.id === id);
  const [tab, setTab] = useState("board");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [open, setOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string>();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskPriority, setTaskPriority] =
    useState<KanbanTask["priority"]>("media");
  const [hours, setHours] = useState(4);
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newMember, setNewMember] = useState("");
  if (!project)
    return (
      <div className="team-page">
        <div className="team-empty">
          <h1>Proyecto no encontrado</h1>
          <Link className="text-primary" to="/projects">
            Volver al equipo
          </Link>
        </div>
      </div>
    );
  const filtered = project.tasks.filter(
    (t) =>
      `${t.title} ${t.description}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!assignee || t.assigneeId === assignee) &&
      (!priority || t.priority === priority),
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    const data = {
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assigneeId: taskOwner,
      priority: taskPriority,
      estimatedTime: `${hours}h`,
      dueDate: date ? new Date(`${date}T12:00:00`) : undefined,
    };
    if (editingTaskId)
      updateProject(project!.id, {
        tasks: project!.tasks.map((t) =>
          t.id === editingTaskId ? { ...t, ...data } : t,
        ),
      });
    else addTask(project!.id, { ...data, column: "todo" });
    setOpen(false);
    setTaskTitle("");
    setTaskDescription("");
    setDate("");
    setEditingTaskId(undefined);
  }
  function openTask(task?: KanbanTask) {
    setEditingTaskId(task?.id);
    setTaskTitle(task?.title || "");
    setTaskDescription(task?.description || "");
    setTaskOwner(task?.assigneeId || "");
    setTaskPriority(task?.priority || "media");
    setHours(task ? parseFloat(task.estimatedTime) || 4 : 4);
    setDate(task?.dueDate ? format(task.dueDate, "yyyy-MM-dd") : "");
    setOpen(true);
  }
  return (
    <div className="team-page">
      <div className="team-container">
        <Link
          to={isBoardPage ? "/board" : "/projects"}
          className="flex gap-2 items-center text-sm text-muted-foreground mb-6"
        >
          <ArrowLeft size={16} />{" "}
          {isBoardPage ? "Todos los tableros" : "Proyectos del equipo"}
        </Link>
        <header className="team-heading !mb-4">
          <div>
            <p className="team-eyebrow">NAATZO · PROYECTO</p>
            <h1>{project.title}</h1>
            <p className="text-muted-foreground mt-2 max-w-3xl whitespace-pre-wrap">
              {project.description ||
                "Proyecto creado desde un documento. Los detalles y los integrantes se completarán al analizarlo."}
            </p>
          </div>
          <Link
            to={`/team-calendar?project=${encodeURIComponent(project.id)}`}
            className="team-button"
          >
            <CalendarDays size={17} /> Entregas
          </Link>
        </header>
        <ProjectSaveStatus project={project} />
        <div className="flex gap-4 items-center">
          <div className="flex -space-x-2">
            {project.members.map((m) => (
              <span
                key={m.id}
                title={m.name}
                style={{ background: m.color }}
                className="team-avatar"
              >
                {m.initials}
              </span>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {getProgress(project)}% completado
          </span>
        </div>
        {storageError && (
          <p role="alert" className="team-error">
            {storageError}
          </p>
        )}
        <nav className="team-tabs" aria-label="Secciones del proyecto">
          {[
            ["board", "Tablero Kanban"],
            ["members", "Equipo y documentos"],
            ["agents", "Agentes"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "board" && (
          <>
            <div className="team-toolbar">
              <div className="flex gap-2 flex-wrap">
                <label className="flex items-center gap-2">
                  <Search size={17} className="text-muted-foreground" />
                  <input
                    className="team-filter"
                    aria-label="Buscar tareas"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar tareas…"
                  />
                </label>
                <select
                  className="team-filter"
                  aria-label="Filtrar por responsable"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Todo el equipo</option>
                  {project.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  className="team-filter"
                  aria-label="Filtrar por prioridad"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Todas las prioridades</option>
                  {["alta", "media", "baja"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <button className="team-primary" onClick={() => openTask()}>
                <Plus size={17} /> Nueva tarea
              </button>
            </div>
            <div className="team-board">
              {columns.map((c, index) => (
                <section
                  key={c.key}
                  className="team-column"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData("text/plain");
                    if (project.tasks.some((t) => t.id === taskId))
                      moveTask(project.id, taskId, c.key);
                  }}
                >
                  <header>
                    <span className="flex items-center gap-2">
                      <i
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: [
                            "#94a3b8",
                            "var(--primary)",
                            "#e7aa43",
                            "#40a888",
                          ][index],
                        }}
                      />
                      {c.label}
                    </span>
                    <span className="team-pill">
                      {filtered.filter((t) => t.column === c.key).length}
                    </span>
                  </header>
                  {filtered
                    .filter((t) => t.column === c.key)
                    .map((t, i) => {
                      const member = project.members.find(
                        (m) => m.id === t.assigneeId,
                      );
                      const overdue =
                        t.dueDate &&
                        isBefore(t.dueDate, startOfDay(new Date())) &&
                        t.column !== "done";
                      return (
                        <article
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", t.id)
                          }
                          key={t.id}
                          className="team-task"
                        >
                          <div className="flex justify-between mb-3">
                            <span className="text-[10px] text-muted-foreground">
                              NTZ-{project.tasks.indexOf(t) + 1}
                            </span>
                            <span
                              className={`text-xs ${t.priority === "alta" ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              ↑ {t.priority}
                            </span>
                          </div>
                          <h3>
                            <button
                              className="text-left hover:text-primary"
                              title="Editar tarea"
                              onClick={() => openTask(t)}
                            >
                              {t.title}
                            </button>
                          </h3>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                              {t.description}
                            </p>
                          )}
                          <AcceptanceChecklist task={t} />
                          <div className="team-task-meta">
                            <Clock size={13} />
                            <span>{t.estimatedTime}</span>
                            {t.dueDate && (
                              <span
                                className={overdue ? "text-destructive" : ""}
                              >
                                {overdue ? "Vencida · " : ""}
                                {format(t.dueDate, "d MMM", { locale: es })}
                              </span>
                            )}
                            <span className="ml-auto">
                              {member ? (
                                <span
                                  className="team-avatar"
                                  style={{ background: member.color }}
                                  title={member.name}
                                >
                                  {member.initials}
                                </span>
                              ) : (
                                "Sin asignar"
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <select
                              aria-label={`Estado de ${t.title}`}
                              value={t.column}
                              onChange={(e) =>
                                moveTask(
                                  project.id,
                                  t.id,
                                  e.target.value as KanbanColumn,
                                )
                              }
                            >
                              {columns.map((col) => (
                                <option
                                  key={col.key}
                                  value={col.key}
                                  disabled={
                                    col.key === "done" &&
                                    t.acceptanceCriteria?.some(
                                      (item) => !item.completed,
                                    )
                                  }
                                >
                                  {col.label}
                                </option>
                              ))}
                            </select>
                            <button
                              aria-label={`Eliminar ${t.title}`}
                              title="Eliminar tarea"
                              className="text-muted-foreground hover:text-destructive mt-3"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Eliminar la tarea «${t.title}»?`,
                                  )
                                )
                                  deleteTask(project.id, t.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  <button
                    className="flex items-center gap-2 text-xs text-muted-foreground mt-3"
                    onClick={() => openTask()}
                  >
                    <Plus size={14} /> Agregar tarea
                  </button>
                </section>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Arrastra las tarjetas entre columnas o usa el selector de estado.
              El tablero se guarda automáticamente en el proyecto compartido.
            </p>
          </>
        )}
        {tab === "members" && (
          <div className="team-detail-grid">
            <section className="team-panel">
              <h2 className="flex gap-2">
                <Users size={20} /> Integrantes y disponibilidad
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Las horas representan disponibilidad semanal. La carga del
                tablero corresponde a tareas abiertas.
              </p>
              {project.members.length === 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                  Los integrantes aún no se han confirmado. Puedes agregarlos
                  aquí o completar el equipo al analizar el documento o la
                  descripción.
                </p>
              )}
              <form
                className="flex gap-2 mb-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newMember.trim();
                  if (
                    !name ||
                    project.members.some(
                      (m) => m.name.toLowerCase() === name.toLowerCase(),
                    )
                  )
                    return;
                  updateProject(project.id, {
                    members: [
                      ...project.members,
                      makeMember(name, project.members.length),
                    ],
                  });
                  setNewMember("");
                }}
              >
                <input
                  className="team-filter min-w-0 flex-1"
                  aria-label="Nombre del nuevo integrante"
                  placeholder="Nombre del integrante"
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  maxLength={100}
                />
                <button className="team-primary" disabled={!newMember.trim()}>
                  Agregar
                </button>
              </form>
              {project.members.map((m) => {
                const assigned = project.tasks
                  .filter((t) => t.assigneeId === m.id && t.column !== "done")
                  .reduce((n, t) => n + (parseFloat(t.estimatedTime) || 0), 0);
                return (
                  <div key={m.id} className="border-b border-border py-5">
                    {user && (
                      <button
                        type="button"
                        className="team-button mb-3 !text-xs"
                        disabled={
                          myMemberId(project, user) === m.id ||
                          Boolean(m.userId && m.userId !== user.id)
                        }
                        onClick={() =>
                          updateProject(project.id, {
                            members: linkMember(project.members, m.id, user),
                          })
                        }
                      >
                        {myMemberId(project, user) === m.id
                          ? "Mi integrante"
                          : m.userId
                            ? "Cuenta vinculada"
                            : "Este integrante soy yo"}
                      </button>
                    )}
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className="team-avatar"
                        style={{ background: m.color }}
                      >
                        {m.initials}
                      </span>
                      <div>
                        <b>{m.name}</b>
                        <p className="text-xs text-muted-foreground">
                          {assigned} horas pendientes
                        </p>
                      </div>
                    </div>
                    <div className="team-form">
                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          Rol
                          <input
                            value={m.role}
                            onChange={(e) =>
                              updateProject(project.id, {
                                members: project.members.map((member) =>
                                  member.id === m.id
                                    ? { ...member, role: e.target.value }
                                    : member,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Horas por semana
                          <input
                            type="number"
                            min={1}
                            max={80}
                            value={m.weeklyHours}
                            onChange={(e) =>
                              updateProject(project.id, {
                                members: project.members.map((member) =>
                                  member.id === m.id
                                    ? {
                                        ...member,
                                        weeklyHours: Math.max(
                                          1,
                                          Math.min(80, Number(e.target.value)),
                                        ),
                                      }
                                    : member,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Habilidades (separadas por comas)
                        <input
                          value={m.skills.join(",")}
                          onChange={(e) =>
                            updateProject(project.id, {
                              members: project.members.map((member) =>
                                member.id === m.id
                                  ? {
                                      ...member,
                                      skills: e.target.value.split(","),
                                    }
                                  : member,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>
            <aside className="space-y-5">
              <section className="team-panel">
                <h2>Documento del proyecto</h2>
                {project.document ? (
                  <a
                    download={project.document.name}
                    href={project.document.data}
                    className="flex items-center gap-2 text-primary text-sm break-all"
                  >
                    <FileText size={18} /> {project.document.name}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay documento adjunto.
                  </p>
                )}
              </section>
              <section className="team-panel">
                <h2>Descripción del proyecto</h2>
                <button
                  className="team-button"
                  onClick={() => {
                    setEditTitle(project.title);
                    setEditDescription(project.description);
                    setEditing(true);
                  }}
                >
                  Editar descripción
                </button>
              </section>
            </aside>
          </div>
        )}
        {tab === "members" && <ProjectInvitations project={project} />}
        {tab === "agents" && <AgentPanel project={project} />}
        {open && (
          <div className="team-modal-backdrop">
            <section
              className="team-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-dialog"
            >
              <div className="flex justify-between">
                <h2 id="task-dialog">
                  {editingTaskId ? "Editar tarea" : "Nueva tarea"}
                </h2>
                <button onClick={() => setOpen(false)} aria-label="Cerrar">
                  ✕
                </button>
              </div>
              <form onSubmit={submit} className="team-form mt-5">
                <label>
                  Título
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    rows={3}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                  />
                </label>
                <label>
                  Responsable
                  <select
                    aria-label="Responsable"
                    value={taskOwner}
                    onChange={(e) => setTaskOwner(e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label>
                    Prioridad
                    <select
                      value={taskPriority}
                      onChange={(e) =>
                        setTaskPriority(
                          e.target.value as KanbanTask["priority"],
                        )
                      }
                    >
                      {["alta", "media", "baja"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Horas estimadas
                    <input
                      required
                      type="number"
                      min={1}
                      max={160}
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </label>
                </div>
                <label>
                  Fecha de entrega
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button
                  disabled={!taskTitle.trim()}
                  className="team-primary justify-center"
                >
                  {editingTaskId ? "Guardar tarea" : "Crear tarea"}
                </button>
              </form>
            </section>
          </div>
        )}
        {editing && (
          <div className="team-modal-backdrop">
            <section
              className="team-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Editar proyecto"
            >
              <h2>Editar proyecto</h2>
              <form
                className="team-form mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateProject(project.id, {
                    title: editTitle.trim(),
                    description: editDescription.trim(),
                  });
                  setEditing(false);
                }}
              >
                <label>
                  Nombre
                  <input
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    rows={6}
                    required
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    className="team-primary"
                    disabled={!editTitle.trim() || !editDescription.trim()}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="team-button"
                    onClick={() => setEditing(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
