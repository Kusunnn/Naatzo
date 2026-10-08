function taskOrdinal(question) {
  const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = text.match(/\b(\d+)(?:ra|ro|da|do|ta|to|a|o|[ºª])?\s+(?:tarea|actividad)\b|\b(?:tarea|actividad)\s+(?:numero\s+)?(\d+)\b/);
  if (match) return Number(match[1] || match[2]);
  const words = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta'];
  const index = words.findIndex(word => new RegExp(`\\b${word}\\s+(tarea|actividad)\\b`).test(text));
  return index < 0 ? null : index + 1;
}

function resolveTaskReference(question, history, tasks) {
  const ordinal = taskOrdinal(question);
  if (ordinal === null) return { ordinal: null, task: null };
  const lastList = [...(history || [])].reverse().find(m =>
    m.role === 'assistant' && String(m.content).startsWith('Estas son tus tareas pendientes más próximas:'));
  if (!lastList) return { ordinal, task: null };
  const line = String(lastList.content).split('\n').find(line => line.startsWith(`${ordinal}. **`));
  if (!line) return { ordinal, task: null };
  const escape = value => String(value || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const matches = (tasks || []).filter(task => line.startsWith(`${ordinal}. **${escape(task.title)}**`) &&
    (task.projectTitle ? line.includes(` — Equipo: ${escape(task.projectTitle)}`) : line.includes(' — Individual')));
  return { ordinal, task: matches.length === 1 ? matches[0] : null };
}
module.exports = { taskOrdinal, resolveTaskReference };
