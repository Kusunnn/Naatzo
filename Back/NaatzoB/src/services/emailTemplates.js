const catalog = {
  invitation: {
    title: 'Te invitaron a un proyecto', action: 'Aceptar invitación',
    required: ['inviterName', 'projectName', 'expiresAt', 'url'],
    subject: d => `Invitación a ${d.projectName} · Naatzo`,
    body: d => `${d.inviterName} te invita a participar en el proyecto «${d.projectName}».\n\nPodrás consultar las actividades, colaborar en el tablero y seguir las entregas del equipo.\n\nInicia sesión o crea una cuenta con el correo al que recibiste esta invitación y acepta para unirte.\n\nLa invitación vence el ${date(d.expiresAt)}. Si no esperabas este mensaje, puedes ignorarlo.`,
  },
  invitationAccepted: {
    title: 'Un integrante se unió al equipo', action: 'Ver integrantes',
    required: ['memberName', 'projectName', 'url'],
    subject: d => `${d.memberName} se unió a ${d.projectName} · Naatzo`,
    body: d => `${d.memberName} aceptó la invitación y ya forma parte del proyecto «${d.projectName}».\n\nPuedes revisar sus datos y asignarle actividades desde el tablero.`,
  },
  projectWelcome: {
    title: 'Bienvenido al proyecto', action: 'Abrir proyecto',
    required: ['projectName', 'url'],
    subject: d => `Ya formas parte de ${d.projectName} · Naatzo`,
    body: d => `Tu incorporación al proyecto «${d.projectName}» está confirmada.\n\nConsulta las tareas del equipo, tus actividades asignadas y el calendario de entregas para comenzar.`,
  },
  taskAssigned: {
    title: 'Tienes una tarea asignada', action: 'Ver tarea',
    required: ['taskName', 'projectName', 'url'],
    subject: d => `Nueva tarea: ${d.taskName} · Naatzo`,
    body: d => `Se te asignó la actividad «${d.taskName}» en el proyecto «${d.projectName}».${d.dueAt ? `\n\nFecha de entrega: ${date(d.dueAt)}.` : ''}${d.priority ? `\nPrioridad: ${d.priority}.` : ''}\n\nRevisa los detalles y los criterios de aceptación antes de comenzar.`,
  },
  deadlineReminder: {
    title: 'Tu entrega se acerca', action: 'Revisar actividad',
    required: ['taskName', 'dueAt', 'url'],
    subject: d => `Recordatorio: ${d.taskName} · Naatzo`,
    body: d => `Recuerda completar la actividad «${d.taskName}»${project(d)}.\n\nFecha de entrega: ${date(d.dueAt)}.\n\nRevisa los criterios de aceptación pendientes y actualiza el avance de tu actividad.`,
  },
  deadlineUrgent: {
    title: 'Tu entrega está próxima', action: 'Revisar actividad',
    required: ['taskName', 'dueAt', 'url'],
    subject: d => `Entrega próxima: ${d.taskName} · Naatzo`,
    body: d => `Falta una hora o menos para la entrega de «${d.taskName}»${project(d)}.\n\nFecha de entrega: ${date(d.dueAt)}.\n\nComprueba los criterios pendientes y actualiza el tablero. Si necesitas más tiempo, comunícalo a tu equipo.`,
  },
  deadlineOverdue: {
    title: 'Tienes una entrega vencida', action: 'Actualizar actividad',
    required: ['taskName', 'dueAt', 'url'],
    subject: d => `Entrega vencida: ${d.taskName} · Naatzo`,
    body: d => `La fecha de entrega de «${d.taskName}»${project(d)} ya pasó y la actividad sigue pendiente.\n\nFecha de entrega: ${date(d.dueAt)}.\n\nRevisa su estado y acuerda los siguientes pasos con tu equipo, si corresponde.`,
  },
  taskUpdated: {
    title: 'Una actividad cambió', action: 'Ver cambios',
    required: ['taskName', 'changes', 'url'],
    subject: d => `Cambios en ${d.taskName} · Naatzo`,
    body: d => `Se actualizó la actividad «${d.taskName}»${project(d)}.\n\nCambios:\n${d.changes}\n\nConsulta los detalles antes de continuar con tu trabajo.`,
  },
  taskCompleted: {
    title: 'Una actividad se completó', action: 'Ver actividad',
    required: ['taskName', 'memberName', 'projectName', 'url'],
    subject: d => `Actividad completada: ${d.taskName} · Naatzo`,
    body: d => `${d.memberName} completó la actividad «${d.taskName}» en «${d.projectName}».\n\nTodos sus criterios de aceptación están marcados como cumplidos. Consulta el tablero para revisar el avance del proyecto.`,
  },
  projectCompleted: {
    title: 'El proyecto llegó al 100 %', action: 'Ver proyecto',
    required: ['projectName', 'url'],
    subject: d => `Proyecto completado: ${d.projectName} · Naatzo`,
    body: d => `El proyecto «${d.projectName}» alcanzó el 100 % de progreso según las actividades y los criterios registrados.\n\nRevisa el tablero con tu equipo para confirmar las entregas finales.`,
  },
  importantNotification: {
    title: 'Tienes una notificación importante', action: 'Ver detalles',
    required: ['notificationTitle', 'message', 'url'],
    subject: d => `${d.notificationTitle} · Naatzo`,
    body: d => d.message,
  },
};

function date(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Fecha de correo inválida.');
  return `${parsed.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' })} (hora de Ciudad de México)`;
}
function project(d) { return d.projectName ? ` del proyecto «${d.projectName}»` : ''; }
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function renderEmail(type, data = {}) {
  const template = catalog[type];
  if (!template) throw new Error(`Plantilla desconocida: ${type}`);
  for (const field of template.required) {
    if (data[field] == null || !String(data[field]).trim()) throw new Error(`Falta el campo ${field} para ${type}.`);
  }
  const url = new URL(data.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enlace de correo inválido.');
  const greeting = data.recipientName ? `Hola, ${data.recipientName}.` : 'Hola.';
  const body = template.body(data);
  const subject = template.subject(data).replace(/[\r\n]+/g, ' ');
  const footer = 'Este es un mensaje automático de Naatzo. No respondas a este correo.';
  const text = `${greeting}\n\n${body}\n\n${template.action}:\n${url.href}\n\n${footer}`;
  const paragraphs = `${greeting}\n\n${body}`.split('\n\n').map(p => `<p style="line-height:1.6">${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#242536"><main style="max-width:580px;margin:24px auto;padding:28px;background:#fff;border-radius:16px"><div style="font-size:24px;font-weight:bold;color:#526f1b">Naatzo</div><h1 style="font-size:22px">${escape(template.title)}</h1>${paragraphs}<p style="margin:28px 0"><a href="${escape(url.href)}" style="display:inline-block;padding:12px 20px;background:#c4df77;color:#253514;text-decoration:none;border-radius:8px;font-weight:bold">${escape(template.action)}</a></p><p style="font-size:12px;line-height:1.6">Si el botón no funciona, abre este enlace:<br><a href="${escape(url.href)}" style="overflow-wrap:anywhere">${escape(url.href)}</a></p><hr style="border:0;border-top:1px solid #eee"><p style="font-size:12px;color:#666">${footer}</p></main></body></html>`;
  // Numeric HTML entities remain readable even when an email client chooses
  // the wrong character encoding. Plain text and headers remain UTF-8.
  const encodedHtml=html.replace(/[^\x00-\x7f]/gu,char=>`&#${char.codePointAt(0)};`);
  return { subject:subject.normalize('NFC'), text:text.normalize('NFC'), html:encodedHtml };
}

module.exports = { renderEmail, catalog };
