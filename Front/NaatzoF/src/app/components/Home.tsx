import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { useMyTasks, myTasksProgress } from "../contexts/useMyTasks";
import { acceptanceProgress } from "../services/projectProgress";
import { useAppMode } from "../contexts/AppModeContext";
import { useProjects } from "../contexts/ProjectContext";
import {
  Calendar,
  BookOpen,
  MessageSquare,
  Library as LibraryIcon,
  Users,
  Columns3,
} from "lucide-react";
import { MetricCard } from "./MetricCard";
import { ElephantMascot } from "./ElephantMascot";
import { motion } from "motion/react";
import { format, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";

export function Home() {
  const { user } = useAuth();
  const { tasks: individualTasks } = useMyTasks();
  const { mode } = useAppMode();
  const { projects } = useProjects();
  const tasks =
    mode === "team"
      ? projects.flatMap((p) =>
          p.tasks.map((t) => ({
            ...t,
            completed: t.column === "done",
            dueDate: t.dueDate || new Date(NaN),
            acceptanceUnits: acceptanceProgress(t),
          })),
        )
      : individualTasks;
  const navigate = useNavigate();

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);
  const todayTasks = incompleteTasks.filter((t) => isToday(t.dueDate));
  const tomorrowTasks = incompleteTasks.filter((t) => isTomorrow(t.dueDate));

  const quickActions =
    mode === "team"
      ? [
          {
            title: "Proyectos",
            description: "Detalles, documentos e integrantes",
            icon: Users,
            color: "from-primary to-accent",
            path: "/projects",
          },
          {
            title: "Tablero",
            description: "Asigna y organiza las tareas",
            icon: Columns3,
            color: "from-primary to-accent",
            path: "/board",
          },
          {
            title: "Calendario de actividades",
            description: "Entregas y responsables",
            icon: Calendar,
            color: "from-primary to-accent",
            path: "/team-calendar",
          },
          {
            title: "Asistente",
            description: "Habla con Naatzo",
            icon: MessageSquare,
            color: "from-primary to-accent",
            path: "/chatbot",
          },
        ]
      : [
          {
            title: "Calendario",
            description: "Organiza tus tareas",
            icon: Calendar,
            color: "from-primary to-accent",
            path: "/calendar",
          },
          {
            title: "Recomendaciones",
            description: "Recursos personalizados",
            icon: BookOpen,
            color: "from-accent to-primary",
            path: "/recommendations",
          },
          {
            title: "Asistente",
            description: "Habla con Naatzo",
            icon: MessageSquare,
            color: "from-primary to-accent",
            path: "/chatbot",
          },
          {
            title: "Biblioteca",
            description: "Explora libros",
            icon: LibraryIcon,
            color: "from-accent to-primary",
            path: "/library",
          },
        ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary via-background to-secondary">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-2">
                ¡Hola, {user?.name}!
              </h1>
              <p className="text-muted-foreground text-base md:text-lg">
                {mode === "team" ? "Espacio de equipo · " : ""}
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
              </p>
            </div>
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ElephantMascot size="large" />
            </motion.div>
          </div>
        </motion.div>

        <div className="metric-grid mb-12">
          <MetricCard
            label="Tareas pendientes"
            value={incompleteTasks.length}
            icon="pending"
          />
          <MetricCard
            label="Completadas"
            value={completedTasks.length}
            icon="completed"
          />
          <MetricCard
            label="Progreso"
            value={`${myTasksProgress(tasks)}%`}
            icon="progress"
          />
        </div>

        {(todayTasks.length > 0 || tomorrowTasks.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl border border-border p-6 mb-12"
          >
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              Próximas tareas
            </h2>

            <div className="space-y-3">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/20"
                >
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">
                      {task.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Hoy a las {format(task.dueDate, "HH:mm")}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm font-medium">
                    Hoy
                  </span>
                </div>
              ))}

              {tomorrowTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-4 bg-secondary rounded-xl border border-border"
                >
                  <div className="w-2 h-2 bg-accent rounded-full" />
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">
                      {task.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Mañana a las {format(task.dueDate, "HH:mm")}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-accent text-accent-foreground rounded-full text-sm font-medium">
                    Mañana
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Acceso rápido
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {quickActions.map((action, index) => (
              <motion.button
                key={action.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                onClick={() => navigate(action.path)}
                className="group relative bg-card rounded-2xl border border-border p-6 hover:border-primary/30 transition-all overflow-hidden"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-5 transition-opacity`}
                />
                <div className="metric-symbol mb-4">
                  <action.icon className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {action.title}
                </h3>
                <p className="text-muted-foreground">{action.description}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
