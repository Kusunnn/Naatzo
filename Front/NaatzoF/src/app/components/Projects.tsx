import { useState, useRef, FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  Users,
  Plus,
  ArrowUpRight,
  CalendarDays,
  FileText,
  X,
} from "lucide-react";
import { makeMember, useProjects } from "../contexts/ProjectContext";
import "./team.css";
import { MetricCard } from "./MetricCard";
import { useAuth } from '../contexts/AuthContext';
import { isSelfParticipant } from '../services/projectProgress';
import { parseParticipants } from '../services/participantInput';

export function Projects() {
  const {user}=useAuth();
  const { projects, addProject, getProgress, storageError } = useProjects();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [names, setNames] = useState("");
  const [file, setFile] = useState<File>();
  const fileInput=useRef<HTMLInputElement>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!file && !description.trim())
        throw new Error("Sube un documento o escribe una descripción para continuar.");
      if(!parseParticipants(names).length)throw new Error('Agrega al menos un integrante. Puedes escribir “yo” si trabajas solo.');
      let document;
      if (file) {
        if (file.size > 2 * 1024 * 1024)
          throw new Error(
            "El documento debe pesar como máximo 2 MB.",
          );
        if (!/\.(pdf|docx|txt|md)$/i.test(file.name))
          throw new Error("Usa un documento PDF, DOCX, TXT o Markdown.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("No se pudo leer el documento."));
          reader.readAsDataURL(file);
        });
        document = { name: file.name, data };
      }
      const members = parseParticipants(names).map(({name:label,role},index)=>{
        const name=isSelfParticipant(label)&&user?user.name:label.trim();
        const member={...makeMember(name,index),role};
        return user&&name.toLowerCase()===user.name.trim().toLowerCase()?{...member,userId:user.id,email:user.email}:member;
      }).filter((member,index,all)=>member.name&&all.findIndex(m=>m.name.toLowerCase()===member.name.toLowerCase())===index);
      const id = addProject({
        title:
          title.trim() ||
          (file
            ? file!.name.replace(/\.[^.]+$/, "")
            : description.trim().split("\n")[0].slice(0, 100)),
        description: description.trim(),
        members,
        document,
      });
      navigate(`/projects/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="team-page">
      <div className="team-container">
        <header className="team-heading">
          <div className="flex items-center gap-4">
            <div className="team-symbol">
              <Users />
            </div>
            <div>
              <p className="team-eyebrow">NAATZO · ESPACIO DE EQUIPO</p>
              <h1>Proyectos que avanzan juntos</h1>
              <p className="text-muted-foreground">
                Del primer acuerdo a la última entrega, en un solo lugar.
              </p>
            </div>
          </div>
          <button className="team-primary" onClick={() => setOpen(true)}>
            <Plus size={18} /> Nuevo proyecto
          </button>
        </header>
        <div className="team-overview">
          <MetricCard
            label="Proyectos"
            value={projects.length}
            icon="projects"
          />
          <MetricCard
            label="Tareas pendientes"
            value={
              projects
                .flatMap((p) => p.tasks)
                .filter((t) => t.column !== "done").length
            }
            icon="pending"
          />
          <MetricCard
            label="Entregas completadas"
            value={
              projects
                .flatMap((p) => p.tasks)
                .filter((t) => t.column === "done").length
            }
            icon="completed"
          />
          <Link to="/team-calendar" className="team-calendar-link">
            <CalendarDays size={21} /> Calendario de entregas{" "}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        {storageError && (
          <p role="alert" className="team-error">
            {storageError}
          </p>
        )}
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-semibold">Tus proyectos</h2>
          <span className="text-sm text-muted-foreground">
            Guardados en este navegador
          </span>
        </div>
        {projects.length === 0 ? (
          <div className="team-empty">
            <Users size={42} className="text-primary mx-auto mb-4" />
            <h2>Un espacio para tu próximo proyecto</h2>
            <p>
              Describe el proyecto o sube un documento con su nombre, detalles e
              integrantes.
            </p>
            <button
              className="team-primary mx-auto mt-5"
              onClick={() => setOpen(true)}
            >
              Crear mi primer proyecto
            </button>
          </div>
        ) : (
          <div className="team-project-grid">
            {projects.map((p) => (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="team-project-card"
              >
                <div className="flex justify-between items-center">
                  <span className="team-pill">{p.tasks.length} tareas</span>
                  <ArrowUpRight size={20} className="text-muted-foreground" />
                </div>
                <h2>{p.title}</h2>
                <p className="text-muted-foreground line-clamp-3">
                  {p.description || "Documento adjunto · Pendiente de analizar"}
                </p>
                <div className="flex items-center justify-between mt-6">
                  <div className="flex -space-x-2">
                    {p.members.slice(0, 5).map((m) => (
                      <span
                        key={m.id}
                        className="team-avatar"
                        style={{ background: m.color }}
                        title={m.name}
                      >
                        {m.initials}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {p.members.length} integrantes
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-5 mb-2">
                  <span>Progreso</span>
                  <b>{getProgress(p)}%</b>
                </div>
                <div className="team-progress">
                  <div style={{ width: `${getProgress(p)}%` }} />
                </div>
                {p.document && (
                  <span className="flex gap-2 text-xs text-muted-foreground mt-4">
                    <FileText size={14} /> {p.document.name}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
        {open && (
          <div className="team-modal-backdrop">
            <section
              className="team-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-dialog"
            >
              <div className="flex justify-between items-center">
                <h2 id="project-dialog">Nuevo proyecto</h2>
                <button aria-label="Cerrar" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <p className="text-muted-foreground mt-2 mb-6">
                Sube un documento, describe lo que necesitas o combina ambos.
                Completa al menos uno; los comentarios pueden aclarar cómo usar el archivo.
              </p>
              <form onSubmit={submit} className="team-form">
                  <label>
                    Documento del proyecto (opcional si escribes una descripción)
                    <input
                      aria-label="Documento del proyecto"
                      type="file"
                      ref={fileInput}
                      accept=".pdf,.docx,.txt,.md"
                      onChange={(e) => setFile(e.target.files?.[0])}
                    />
                    {file && <span className="text-sm text-primary">Archivo seleccionado: {file.name}</span>}
                    {file && <button type="button" className="team-button" onClick={()=>{setFile(undefined);if(fileInput.current)fileInput.current.value='';}}>Quitar archivo</button>}
                    <span className="text-xs text-muted-foreground">
                      PDF, DOCX, TXT o Markdown · Máximo 2 MB.
                    </span>
                  </label>
                <label>
                  Nombre del proyecto (opcional)
                  <input
                    autoFocus
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      file
                        ? "Usaremos el nombre del archivo mientras se analiza"
                        : "Ej. Plataforma de reservas"
                    }
                  />
                </label>
                  <label>
                    Descripción o comentarios (opcional si subes un documento)
                    <textarea
                      aria-label="Descripción o comentarios"
                      maxLength={30000}
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ej. Estos apuntes de química son para una exposición de 10 minutos. Necesitamos diapositivas y repartir los temas entre el equipo."
                    />
                  </label>
                <label>
                  Integrantes (obligatorio) y roles (opcionales)
                  <span className="text-xs text-muted-foreground">Separa nombres con “y”, comas o saltos de línea. Escribe “yo” para incluir tu cuenta. Los roles son opcionales.</span>
                  <textarea
                    aria-label="Integrantes y roles"
                    required
                    rows={2}
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    placeholder={'yo: expositor\nLuis: investigación\nAna\nAgrega al menos un nombre. Los roles son opcionales.'}
                  />
                </label>
                {error && (
                  <p role="alert" className="team-error">
                    {error}
                  </p>
                )}
                <button
                  disabled={
                    saving ||
                    !parseParticipants(names).length ||
                    (!file && !description.trim())
                  }
                  className="team-primary justify-center"
                >
                  {saving ? "Guardando…" : "Crear proyecto"}
                </button>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
