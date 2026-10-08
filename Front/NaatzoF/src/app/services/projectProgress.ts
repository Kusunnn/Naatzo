import type {
  KanbanTask,
  Project,
  TeamMember,
} from "../contexts/ProjectContext";

export function acceptanceProgress(task: KanbanTask) {
  const items = task.acceptanceCriteria || [];
  return items.length
    ? {
        total: items.length,
        completed: items.filter((item) => item.completed).length,
      }
    : { total: 1, completed: task.column === "done" ? 1 : 0 };
}
export function taskProgress(task: KanbanTask) {
  const units = acceptanceProgress(task);
  return Math.round((units.completed / units.total) * 100);
}
export function tasksProgress(tasks: KanbanTask[]) {
  const units = tasks.reduce(
    (sum, task) => {
      const next = acceptanceProgress(task);
      return {
        total: sum.total + next.total,
        completed: sum.completed + next.completed,
      };
    },
    { total: 0, completed: 0 },
  );
  return units.total ? Math.round((units.completed / units.total) * 100) : 0;
}
export function myMemberId(
  project: Project,
  user: { id: string; name: string; email: string } | null,
): string | undefined {
  if (!user) return undefined;
  const linked = project.members.find((member) => member.userId === user.id);
  if (linked) return linked.id;
  const email = project.members.filter(
    (member) =>
      !member.userId &&
      member.email?.toLowerCase() === user.email.toLowerCase(),
  );
  if (email.length === 1) return email[0].id;
  const normalize = (name: string) =>
    name
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  const matches = project.members.filter(
    (member) =>
      !member.userId &&
      !member.email &&
      normalize(member.name) === normalize(user.name),
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

export function linkMember(
  members: TeamMember[],
  memberId: string,
  user: { id: string; email: string },
) {
  return members.map((member) =>
    member.id === memberId
      ? { ...member, userId: user.id, email: user.email }
      : member.userId === user.id
        ? { ...member, userId: undefined, email: undefined }
        : member,
  );
}
