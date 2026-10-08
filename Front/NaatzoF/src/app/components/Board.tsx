import { Link } from "react-router";
import { Columns3, ArrowUpRight, CalendarDays } from "lucide-react";
import { useProjects } from "../contexts/ProjectContext";
import "./team.css";

export function Board() {
  const { projects } = useProjects();
  return (
    <div className="team-page">
      <div className="team-container">
        <header className="team-heading">
          <div className="flex items-center gap-4">
            <div className="team-symbol">
              <Columns3 />
            </div>
            <div>
              <h1>Tablero de tareas</h1>
            </div>
          </div>
          <Link className="team-button" to="/team-calendar">
            <CalendarDays size={18} /> Calendario de actividades
          </Link>
        </header>
        {projects.length ? (
          <div className="team-project-grid">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/board/${project.id}`}
                className="team-project-card"
              >
                <div className="flex justify-between">
                  <span className="team-pill">Tablero Kanban</span>
                  <ArrowUpRight size={20} />
                </div>
                <h2>{project.title}</h2>
                <p className="text-muted-foreground text-sm">
                  {
                    project.tasks.filter((task) => task.column !== "done")
                      .length
                  }{" "}
                  tareas pendientes · {project.members.length} integrantes
                </p>
                <div className="flex gap-2 mt-5">
                  <Columns3 size={17} />
                  <span className="text-sm text-primary">Abrir tablero</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="team-empty">
            <Columns3 size={40} className="mx-auto text-primary mb-4" />
            <h2>Tu equipo aún no tiene tableros</h2>
            <p>Crea un proyecto para organizar y asignar sus tareas.</p>
            <Link className="team-primary mt-5" to="/projects">
              Ir a proyectos
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
