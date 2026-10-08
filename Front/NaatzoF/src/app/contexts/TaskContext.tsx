import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import { apiRequest } from "../services/api";

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  completed: boolean;
  userId?: string;
}

interface TaskContextType {
  tasks: Task[];
  addTask: (task: Omit<Task, "id" | "completed">) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [owned, setOwned] = useState<{ userId: string; tasks: Task[] }>({
    userId: "",
    tasks: [],
  });
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const tasks = owned.userId === user?.id ? owned.tasks : [];

  const mapApiTask = (task: {
    id: string;
    title: string;
    description: string;
    dueAt?: string;
    dueDate?: string;
    completed: boolean;
    userId?: string;
  }): Task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: new Date(task.dueAt || task.dueDate || new Date().toISOString()),
    completed: task.completed,
    userId: task.userId,
  });

  const loadTasks = useCallback(async () => {
    if (!user?.id) {
      setOwned({ userId: "", tasks: [] });
      return;
    }

    try {
      const payload = await apiRequest<{
        tasks: Array<{
          id: string;
          title: string;
          description: string;
          dueAt?: string;
          dueDate?: string;
          completed: boolean;
          userId?: string;
        }>;
      }>(`/tasks?userId=${encodeURIComponent(user.id)}`);

      if (activeUser.current === user.id)
        setOwned({
          userId: user.id,
          tasks: payload.tasks
            .filter((task) => task.userId === user.id)
            .map(mapApiTask),
        });
    } catch {
      if (activeUser.current === user.id)
        setOwned({ userId: user.id, tasks: [] });
    }
  }, [user?.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const addTask = async (task: Omit<Task, "id" | "completed">) => {
    if (!user?.id) {
      return;
    }

    await apiRequest<{ task: unknown }>("/tasks", {
      method: "POST",
      body: {
        userId: user.id,
        title: task.title,
        description: task.description,
        dueAt: task.dueDate.toISOString(),
      },
    });

    await loadTasks();
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    await apiRequest<{ task: unknown }>(`/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: {
        title: updates.title,
        description: updates.description,
        dueAt: updates.dueDate ? updates.dueDate.toISOString() : undefined,
        completed: updates.completed,
      },
    });

    await loadTasks();
  };

  const deleteTask = async (id: string) => {
    await apiRequest<void>(`/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    await loadTasks();
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      return;
    }

    await updateTask(id, { completed: !task.completed });
  };

  return (
    <TaskContext.Provider
      value={{ tasks, addTask, updateTask, deleteTask, toggleTask }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TaskProvider");
  }
  return context;
}
