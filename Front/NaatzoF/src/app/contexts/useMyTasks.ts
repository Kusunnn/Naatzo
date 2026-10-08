import { useAuth } from "./AuthContext";
import { useProjects } from "./ProjectContext";
import { useTasks, Task } from "./TaskContext";
import {
  myMemberId,
  taskProgress,
  acceptanceProgress,
} from "../services/projectProgress";

export interface MyTask extends Task {
  projectId?: string;
  projectName?: string;
  progress?: number;
  acceptanceUnits?: { total: number; completed: number };
}
export function myTasksProgress(
  tasks: {
    completed: boolean;
    acceptanceUnits?: { total: number; completed: number };
  }[],
) {
  const units = tasks.reduce(
    (sum, task) => {
      const next = task.acceptanceUnits || {
        total: 1,
        completed: task.completed ? 1 : 0,
      };
      return {
        total: sum.total + next.total,
        completed: sum.completed + next.completed,
      };
    },
    { total: 0, completed: 0 },
  );
  return units.total ? Math.round((units.completed / units.total) * 100) : 0;
}
export function useMyTasks() {
  const { user } = useAuth();
  const personal = useTasks();
  const { projects } = useProjects();
  const assignments: MyTask[] = projects.flatMap((project) => {
    const memberId = myMemberId(project, user);
    if (!memberId) return [];
    return project.tasks
      .filter((task) => task.assigneeId === memberId)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate || new Date(NaN),
        completed: task.column === "done",
        userId: user?.id,
        projectId: project.id,
        projectName: project.title,
        progress: taskProgress(task),
        acceptanceUnits: acceptanceProgress(task),
      }));
  });
  return {
    ...personal,
    tasks: [...personal.tasks, ...assignments] as MyTask[],
  };
}
