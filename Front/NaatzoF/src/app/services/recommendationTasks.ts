import type { Project } from '../contexts/ProjectContext';
import { myMemberId } from './projectProgress';

export interface RecommendationTask {
  id: string;
  title: string;
  description: string;
  dueDate?: Date;
  taskId?: string;
  projectTitle?: string;
}

export function recommendationTasks(
  individual: { id: string; title: string; description: string; dueDate: Date; completed: boolean }[],
  projects: Project[],
  user: { id: string; name: string; email: string } | null,
): RecommendationTask[] {
  if (!user) return [];
  const personal: RecommendationTask[] = individual.filter(t => !t.completed)
    .map(t => ({ ...t, id: `individual:${t.id}`, taskId: t.id }));
  const team: RecommendationTask[] = projects.flatMap(project => {
    const memberId = myMemberId(project, user);
    if (!memberId) return [];
    return project.tasks.filter(t => t.column !== 'done' && t.assigneeId === memberId)
      .map(t => ({ id: `team:${project.id}:${t.id}`, title: t.title, description: t.description,
        dueDate: t.dueDate, projectTitle: project.title }));
  });
  return [...personal, ...team].sort((a, b) =>
    (a.dueDate?.getTime() || Infinity) - (b.dueDate?.getTime() || Infinity));
}

export function recommendationQuery(task: RecommendationTask): string {
  const params = new URLSearchParams({ limit: '2' });
  if (task.taskId) params.set('taskId', task.taskId);
  else {
    params.set('taskTitle', task.title);
    params.set('taskDescription', task.description);
    if (task.dueDate && Number.isFinite(task.dueDate.getTime())) params.set('dueAt', task.dueDate.toISOString());
  }
  return `/recommendations?${params}`;
}

export function upcomingTasks(tasks: RecommendationTask[], now: number) {
  return tasks.filter((task): task is RecommendationTask & { dueDate: Date } =>
    !!task.dueDate && Number.isFinite(task.dueDate.getTime()) &&
    task.dueDate.getTime() <= now + 3 * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
