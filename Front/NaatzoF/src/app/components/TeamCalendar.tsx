import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import {
  myMemberId,
  taskProgress,
  tasksProgress,
} from "../services/projectProgress";
import {
  useProjects,
  KanbanTask,
  KanbanColumn,
} from "../contexts/ProjectContext";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  Users,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const COLUMN_STATUS: Record<
  KanbanColumn,
  { label: string; color: string; bg: string; border: string }
> = {
  todo: {
    label: "Por Hacer",
    color: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-200",
  },
  "in-progress": {
    label: "En Proceso",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  review: {
    label: "En Revisión",
    color: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
  },
  done: {
    label: "Completada",
    color: "text-green-700",
    bg: "bg-green-100",
    border: "border-green-200",
  },
};

const PRIORITY_DOT: Record<string, string> = {
  alta: "bg-red-400",
  media: "bg-amber-400",
  baja: "bg-green-400",
};

const PROJECT_PALETTE = [
  {
    ring: "ring-primary/60",
    header: "bg-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
  },
  {
    ring: "ring-violet-400/60",
    header: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
  },
  {
    ring: "ring-emerald-400/60",
    header: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    ring: "ring-rose-400/60",
    header: "bg-rose-500",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
  },
];

interface TaskWithMeta extends KanbanTask {
  projectTitle: string;
  projectId: string;
  paletteIdx: number;
}

export function TeamCalendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const { projects, getMemberById } = useProjects();
  const selectedProject =
    projects.find((project) => project.id === searchParams.get("project")) ||
    projects[0];
  const selectedProjects = selectedProject ? [selectedProject] : [];
  const memberId = selectedProject
    ? myMemberId(selectedProject, user)
    : undefined;

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const allTasksWithMeta: TaskWithMeta[] = selectedProjects.flatMap((p, pIdx) =>
    p.tasks
      .filter(
        (t) =>
          t.dueDate &&
          (scope === "all" || (Boolean(memberId) && t.assigneeId === memberId)),
      )
      .map((t) => ({
        ...t,
        projectTitle: p.title,
        projectId: p.id,
        paletteIdx: pIdx % PROJECT_PALETTE.length,
      })),
  );

  const getTasksForDay = (day: Date) =>
    allTasksWithMeta.filter((t) => t.dueDate && isSameDay(t.dueDate, day));

  const weekTasks = allTasksWithMeta.filter(
    (t) => t.dueDate && weekDays.some((d) => isSameDay(t.dueDate!, d)),
  );
  const weekDone = weekTasks.filter((t) => t.column === "done").length;
  const weekOverdue = allTasksWithMeta.filter(
    (t) =>
      t.dueDate &&
      isBefore(t.dueDate, startOfDay(new Date())) &&
      t.column !== "done",
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary via-background to-secondary p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between flex-wrap gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Calendario de actividades
              </h1>
              <p className="text-muted-foreground text-sm capitalize">
                {format(weekStart, "d 'de' MMM", { locale: es })} —{" "}
                {format(addDays(weekStart, 6), "d 'de' MMM yyyy", {
                  locale: es,
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="hidden sm:flex items-center gap-4 bg-card border border-border rounded-2xl px-4 py-2">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Esta semana</p>
                <p className="font-bold text-foreground">
                  {weekDone}/{weekTasks.length}
                </p>
              </div>
              {weekOverdue > 0 && (
                <>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Vencidas</p>
                    <p className="font-bold text-destructive">{weekOverdue}</p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-2 text-sm bg-card border border-border rounded-xl hover:bg-secondary transition-colors font-medium text-foreground shadow-sm"
            >
              Hoy
            </button>
            <div className="flex items-center bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <button
                onClick={() => setCurrentDate((d) => addDays(d, -7))}
                className="p-2.5 hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-foreground" />
              </button>
              <div className="w-px h-5 bg-border" />
              <button
                onClick={() => setCurrentDate((d) => addDays(d, 7))}
                className="p-2.5 hover:bg-secondary transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            Proyecto
            <select
              aria-label="Proyecto del calendario"
              className="team-filter"
              value={selectedProject?.id || ""}
              onChange={(e) => setSearchParams({ project: e.target.value })}
            >
              {projects.length ? (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))
              ) : (
                <option value="">Sin proyectos</option>
              )}
            </select>
          </label>
          <div
            role="group"
            aria-label="Entregas del proyecto"
            className="flex bg-secondary border border-border rounded-xl p-1 gap-1"
          >
            {(
              [
                { key: "all", label: "Todo el equipo" },
                { key: "mine", label: "Solo las mías" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={scope === item.key}
                className={`px-3 py-2 rounded-lg text-sm ${scope === item.key ? "bg-card text-primary shadow-sm font-medium" : "text-muted-foreground"}`}
                onClick={() => setScope(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            Progreso visible: {tasksProgress(allTasksWithMeta)}%
          </span>
        </div>
        {scope === "mine" && selectedProject && !memberId && (
          <p className="text-sm text-muted-foreground">
            No hay un integrante vinculado a tu cuenta en este proyecto.{" "}
            <Link
              to={`/projects/${selectedProject.id}`}
              className="text-primary underline"
            >
              Confirma quién eres en Equipo y documentos
            </Link>{" "}
            para ver tus entregas.
          </p>
        )}
        {!selectedProject && (
          <p className="text-sm text-muted-foreground">
            Crea un proyecto para ver sus actividades.
          </p>
        )}

        {/* Project legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="flex flex-wrap items-center gap-3"
        >
          {selectedProjects.map((p, i) => {
            const palette = PROJECT_PALETTE[i % PROJECT_PALETTE.length];
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all hover:shadow-sm ${palette.badge}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${palette.header}`} />
                {p.title}
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            );
          })}
        </motion.div>

        {/* Week grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-card rounded-3xl shadow-xl border border-border overflow-x-auto"
        >
          {/* Day headers */}
          <div className="grid grid-cols-7 min-w-[680px] border-b border-border bg-secondary/40">
            {weekDays.map((day) => {
              const today = isToday(day);
              const dayTaskCount = getTasksForDay(day).length;
              return (
                <div
                  key={day.toString()}
                  className={`py-3 px-2 text-center border-r border-border last:border-r-0 ${today ? "bg-primary/5" : ""}`}
                >
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {format(day, "EEE", { locale: es })}
                  </p>
                  <div
                    className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full font-bold text-sm ${
                      today
                        ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md"
                        : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="mt-1.5 h-2 flex justify-center gap-0.5">
                    {dayTaskCount > 0 &&
                      Array.from({ length: Math.min(dayTaskCount, 4) }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className={`w-1 h-1 rounded-full ${today ? "bg-primary" : "bg-primary/50"}`}
                          />
                        ),
                      )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Task cells */}
          <div className="min-w-[680px]">
            <div
              className="grid grid-cols-7 min-w-[680px]"
              style={{ minHeight: "360px" }}
            >
              {weekDays.map((day) => {
                const dayTasks = getTasksForDay(day);
                const today = isToday(day);
                return (
                  <div
                    key={day.toString()}
                    className={`border-r border-border last:border-r-0 p-2 space-y-2 ${today ? "bg-primary/[0.03]" : ""}`}
                  >
                    <AnimatePresence mode="popLayout">
                      {dayTasks.map((task) => {
                        const palette = PROJECT_PALETTE[task.paletteIdx];
                        const status = COLUMN_STATUS[task.column];
                        const member = getMemberById(task.assigneeId);
                        const overdue =
                          task.dueDate &&
                          isBefore(task.dueDate, startOfDay(new Date())) &&
                          task.column !== "done";

                        return (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            onClick={() => navigate(`/board/${task.projectId}`)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer hover:shadow-md ring-1 ${palette.ring} ${
                              task.column === "done" ? "opacity-55" : ""
                            } ${overdue ? "ring-destructive/40" : ""} bg-background`}
                          >
                            {/* Project pill */}
                            <div
                              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium mb-1.5 border ${palette.badge}`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${palette.header}`}
                              />
                              <span className="truncate max-w-[80px]">
                                {task.projectTitle}
                              </span>
                            </div>

                            <p
                              className={`text-xs font-semibold leading-tight mb-1 ${task.column === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}
                            >
                              {task.title}
                            </p>

                            <div className="mt-2 mb-2">
                              <span className="text-xs text-muted-foreground">
                                {taskProgress(task)}% · Progreso
                              </span>
                              <div className="team-progress mt-1">
                                <div
                                  style={{ width: `${taskProgress(task)}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mb-1.5">
                              <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {task.estimatedTime} estimadas
                              </span>
                              <div
                                className={`w-1.5 h-1.5 rounded-full ml-auto ${PRIORITY_DOT[task.priority] ?? "bg-muted"}`}
                                title={`Prioridad ${task.priority}`}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${status.bg} ${status.color} ${status.border}`}
                              >
                                {status.label}
                              </span>
                              {overdue && (
                                <AlertCircle
                                  className="w-3.5 h-3.5 text-destructive flex-shrink-0"
                                  aria-label="Vencida"
                                />
                              )}
                            </div>

                            {member && (
                              <div className="flex items-center gap-1.5 mt-1.5 border-t border-border pt-1.5">
                                <div
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ backgroundColor: member.color }}
                                >
                                  {member.initials[0]}
                                </div>
                                <span className="text-xs text-muted-foreground truncate">
                                  {member.name}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {dayTasks.length === 0 && (
                      <div
                        className="flex items-center justify-center"
                        style={{ minHeight: "280px" }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Members legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="bg-card rounded-2xl border border-border p-4 shadow-sm"
        >
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Integrantes del equipo
          </p>
          <div className="flex flex-wrap gap-3">
            {selectedProjects
              .flatMap((p) => p.members)
              .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
              .map((member) => (
                <div key={member.id} className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.initials}
                  </div>
                  <span className="text-sm text-foreground font-medium">
                    {member.name}
                  </span>
                </div>
              ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border">
            {[
              { dot: "bg-red-400", label: "Prioridad Alta" },
              { dot: "bg-amber-400", label: "Prioridad Media" },
              { dot: "bg-green-400", label: "Prioridad Baja" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                {item.label}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
