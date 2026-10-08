function quickAnswer(question, context) {
  const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(hola|buenos dias|buenas tardes|buenas noches|hey)[!¡?.\s]*$/.test(text)) {
    return '¡Hola! ¿En qué te ayudo? Puedes preguntarme por tus tareas pendientes o por el documento que adjuntaste.';
  }
  if (!context || !Array.isArray(context.tasks)) return null;
  if (!/^(?:[¿¡]\s*)?(?:(?:que|cuales)\s+(?:son\s+)?(?:mis\s+)?(?:tareas|actividades)(?:\s+pendientes)?(?:\s+tengo)?|(?:muestra|muestrame|lista|listar)\s+(?:mis\s+)?(?:tareas|actividades|pendientes)(?:\s+pendientes)?|mis\s+(?:tareas|actividades)\s+pendientes)(?:\s+mas)?(?:\s+proximas)?[?!.\s]*$/.test(text)) return null;
  const tasks = context.tasks;
  if (!tasks.length) return 'No tienes tareas pendientes registradas en este momento.';
  const escape = value => String(value || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const deadline = task => Number.isFinite(Date.parse(task.dueAt)) ? Date.parse(task.dueAt) : Infinity;
  const sorted = [...tasks].sort((a, b) => deadline(a) - deadline(b));
  const now = Date.parse(context.now) || Date.now();
  const lines = sorted.slice(0, 5).map((task, i) => {
    const value = deadline(task);
    const date = !Number.isFinite(value) ? 'sin fecha' : /^\d{4}-\d{2}-\d{2}$/.test(task.dueAt)
      ? task.dueAt : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chihuahua' }).format(new Date(value));
    return `${i + 1}. **${escape(task.title)}**${task.projectTitle ? ` — Equipo: ${escape(task.projectTitle)}` : ' — Individual'}\n   Entrega: ${date}${value < now ? ' · **Vencida**' : ''}.`;
  });
  const total = context.totalPending || tasks.length;
  return `Estas son tus tareas pendientes más próximas:\n\n${lines.join('\n\n')}\n\n${total > 5 ? `Tienes ${total} pendientes en total; aquí aparecen las primeras 5. ` : ''}Las horas se muestran en la zona de Chihuahua. ¿Con cuál te ayudo?`;
}
module.exports = { quickAnswer };
