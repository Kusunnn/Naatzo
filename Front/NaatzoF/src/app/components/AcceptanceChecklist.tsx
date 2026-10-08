import { useState } from "react";
import { Plus, X } from "lucide-react";
import { KanbanTask, useProjects } from "../contexts/ProjectContext";
import { taskProgress } from "../services/projectProgress";

export function AcceptanceChecklist({ task }: { task: KanbanTask }) {
  const { setAcceptanceCriteria } = useProjects();
  const [title, setTitle] = useState("");
  const items = task.acceptanceCriteria || [];
  const update = (next: typeof items) =>
    setAcceptanceCriteria(task.projectId, task.id, next);
  return (
    <details
      className="mt-3 border-t border-border pt-3"
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
    >
      <summary className="text-xs cursor-pointer text-muted-foreground">
        Criterios de aceptación{" "}
        {items.length > 0 &&
          `· ${items.filter((item) => item.completed).length}/${items.length} · ${taskProgress(task)}%`}
      </summary>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2">
            <label className="flex gap-2 items-start text-xs flex-1 min-w-0">
              <input
                className="mt-0.5 shrink-0 accent-[var(--primary)]"
                type="checkbox"
                checked={item.completed}
                onChange={() =>
                  update(
                    items.map((criterion) =>
                      criterion.id === item.id
                        ? { ...criterion, completed: !criterion.completed }
                        : criterion,
                    ),
                  )
                }
              />
              <span
                className={
                  item.completed
                    ? "line-through text-muted-foreground break-words"
                    : "break-words"
                }
              >
                {item.title}
              </span>
            </label>
            <button
              type="button"
              aria-label={`Eliminar criterio ${item.title}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                update(items.filter((criterion) => criterion.id !== item.id))
              }
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            update([
              ...items,
              {
                id: crypto.randomUUID(),
                title: title.trim(),
                completed: false,
              },
            ]);
            setTitle("");
          }}
        >
          <input
            className="w-full min-w-0 bg-input-background border border-border rounded-lg p-2 text-xs"
            aria-label={`Nuevo criterio para ${task.title}`}
            placeholder="Agregar criterio…"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={!title.trim()}
            aria-label={`Agregar criterio a ${task.title}`}
            className="text-primary p-1"
          >
            <Plus size={16} />
          </button>
        </form>
        {items.length > 0 && (
          <div className="team-progress">
            <div style={{ width: `${taskProgress(task)}%` }} />
          </div>
        )}
      </div>
    </details>
  );
}
