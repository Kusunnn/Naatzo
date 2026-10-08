# Mensajes de correo de Naatzo

Las plantillas se centralizan en `src/services/emailTemplates.js`. Cada una devuelve asunto, texto y HTML, con acentos UTF-8 y un botón hacia la aplicación. Los nombres y detalles se insertan al generar el mensaje; los valores se escapan para mostrarlos como texto en HTML.

| Plantilla | Mensaje | Campos obligatorios además de `url` |
| --- | --- | --- |
| `invitation` | Invitación al proyecto | `inviterName`, `projectName`, `expiresAt` |
| `invitationAccepted` | Aviso de incorporación para el creador | `memberName`, `projectName` |
| `projectWelcome` | Bienvenida al integrante | `projectName` |
| `taskAssigned` | Nueva actividad asignada | `taskName`, `projectName` |
| `deadlineReminder` | Recordatorio de entrega | `taskName`, `dueAt` |
| `deadlineUrgent` | Entrega en una hora o menos | `taskName`, `dueAt` |
| `deadlineOverdue` | Entrega vencida | `taskName`, `dueAt` |
| `taskUpdated` | Cambios importantes en una actividad | `taskName`, `changes` |
| `taskCompleted` | Criterios de la actividad completados | `taskName`, `memberName`, `projectName` |
| `projectCompleted` | Proyecto al 100 % | `projectName` |
| `importantNotification` | Aviso importante personalizado | `notificationTitle`, `message` |

Todas aceptan `recipientName` opcional para el saludo. `taskAssigned` admite `dueAt` y `priority`; los recordatorios admiten `projectName` para tareas de equipo. Las fechas se muestran en la zona horaria de Ciudad de México. `changes` es un resumen en texto plano. `url` debe llevar al proyecto o actividad correspondiente y usar HTTP o HTTPS.

Las invitaciones, las asignaciones y los recordatorios existentes ya usan estas plantillas. Las demás están preparadas para conectarse a sus respectivos eventos; crear una plantilla no activa un envío automático. Las invitaciones caducan en siete días y requieren aceptación explícita. Los recordatorios mantienen su deduplicación existente.

```js
const { renderEmail } = require('./src/services/emailTemplates');
const mail = require('./src/services/emailService');
await mail.sendEmail({
  to: recipient.email,
  ...renderEmail('taskAssigned', {
    recipientName: recipient.name,
    taskName: task.title,
    projectName: project.title,
    dueAt: task.dueDate,
    priority: task.priority,
    url: `${process.env.APP_URL}/board/${project.id}`,
  }),
});
```

Comprobación sin envíos reales: `node scripts/check-email-templates.js` y `node scripts/check-email-encoding.js`. Para una prueba real autorizada: `node scripts/test-email.js destinatario@example.com`.

El remitente SMTP y su contraseña se configuran exclusivamente en `.env`, excluido de Git. Configura `APP_URL` con la dirección pública de la aplicación antes de enviar invitaciones a otras personas; `localhost` solo funciona desde el equipo donde se ejecuta el frontend.

## Flujo disponible en el frontend

En un proyecto, abre **Equipo y documentos**. El creador puede enviar una invitación por correo o generar un enlace. El destinatario abre `/invite/:token`, inicia sesión o crea una cuenta y acepta explícitamente. La sesión devuelve un token que el frontend envía al backend; las tareas personales y las notificaciones también requieren esa sesión.

**Sincronizar cambios** guarda la versión compartida en Supabase. **Actualizar del equipo** reemplaza la copia local tras confirmación. Si otro integrante guardó una versión más reciente, el servidor rechaza la sobrescritura y pide actualizar primero. Al iniciar sesión se recuperan los proyectos compartidos que todavía no existen en ese navegador; no se reemplazan automáticamente cambios locales pendientes. Los documentos permanecen en la copia local y en el flujo de agentes; no se incluyen en la instantánea compartida de colaboración.
