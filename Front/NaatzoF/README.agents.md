# Equipo y agentes de Naatzo

Solo se cambió el frontend. La sección Equipo adapta el calendario semanal de `Kibo Task Management App` y reconstruye proyectos y tablero sobre los estilos de Naatzo: tokens de color, tarjetas, bordes redondeados y tema oscuro.

## Uso local

El switch Individual / Equipo reproduce el flujo de navegación de Kibo. Individual muestra Inicio, Calendario, Recomendaciones, Biblioteca y Chatbot; Equipo muestra Inicio, Proyectos, Calendario del equipo y Chatbot. El inicio usa las tareas del modo activo. En Equipo, el tema claro es verde lima y el oscuro es lila; la mascota sigue ambos colores, incluso en Inicio y Chatbot. La elección se conserva por usuario en este navegador; las rutas exclusivas activan su modo correspondiente.

En Equipo crea un proyecto mediante Describir proyecto o Subir documento. La descripción es suficiente en el primer modo; un archivo es suficiente en el segundo. Nombre e integrantes manuales son opcionales. Sin un nombre explícito se usa la primera línea de la descripción o el nombre del archivo como título provisional. Un documento puede contener nombre, detalles e integrantes: se conserva para analizarlo en el backend, sin exigir transcribirlos ni fingir extracción local. Se pueden confirmar integrantes manualmente en Equipo y documentos. El tablero propio permite crear y editar tareas, asignar responsable, estimar horas, indicar entrega y prioridad, buscar, filtrar y mover tarjetas por arrastre o selector. Las fechas aparecen en el calendario del equipo. No hay integración con Trello ni Jira.

Proyectos y documentos se guardan en localStorage por ID del usuario actual. No se comparten entre computadoras. Los adjuntos admiten PDF, DOCX, TXT y MD, hasta 2 MB para limitar el almacenamiento local. Los nombres se capturan explícitamente; los documentos se conservan sin inventar extracción ni análisis. Las cuentas existentes se mantienen.

## Contrato de agentes

Cada tarjeta admite una checklist de criterios de aceptación. Marcar todos completa la tarea; desmarcar uno o agregar uno pendiente la reabre. El progreso suma criterios cumplidos sobre criterios totales; una tarea sin checklist aporta una unidad, cumplida cuando está completada. Los criterios y porcentajes se conservan en el almacenamiento local, y el adaptador admite `acceptanceCriteria` opcionales en el plan del agente.

El calendario de Equipo exige un proyecto seleccionado y ofrece Todo el equipo / Solo las mías. El segundo filtro usa el ID de usuario vinculado al integrante, o un correo/nombre completo único sin otra cuenta vinculada. Equipo y documentos permite confirmar Este integrante soy yo. El calendario individual combina las tareas personales del usuario (filtradas también por `userId` del resultado de la API) con sus asignaciones en proyectos; las asignaciones se gestionan desde su checklist en el tablero, sin duplicarlas en la API personal. Esta relación local no reemplaza la autorización del futuro backend compartido.

Las pestañas de Equipo incluyen dos vistas independientes: Tablero (`/board`, con un Kanban por proyecto en `/board/:id`) y Calendario de actividades (`/team-calendar`). El calendario organiza las tareas por fecha; el tablero permite asignarlas y cambiar su estado. Ambos usan las mismas tareas. Abrir una actividad del calendario lleva a su tablero. Proyectos conserva la creación, documentos, integrantes y agentes.

Fuente: `Naatzo_Backendasdasd.pdf`, secciones 4, 5 y 7. Es una propuesta de API; el backend actual todavía no implementa estas rutas. No se consume directamente ningún proveedor de modelos desde el navegador.

`VITE_API_URL` indica la URL base, incluyendo `/api` (por defecto `http://localhost:4000/api`). El cliente está en `src/app/services/agents.ts`. La integración futura de cuentas debe entregar el JWT en `sessionStorage['naatzo-token']`; el cliente lo envía en Authorization, incluso para SSE mediante fetch. El login actual no emite este token.

Flujo preparado:

1. POST `/teams`, esperando `{ team: { id } }`; POST `/teams/:id/members` envía nombre, rol, habilidades y horas semanales.
2. POST `/projects`, con `{ name, description, inputText, teamId }`, esperando `{ project: { id } }`. Estos nombres de propiedades y envoltorios deben confirmarse con el backend, porque el PDF solo especifica las rutas en estos casos.
3. POST `/projects/:id/document`, multipart con campo `document`. Confirmar el nombre del campo con el backend. PDF, DOCX y TXT según el documento; los archivos MD se envían como TXT. Para proyectos creados solo desde documento, la creación anterior debe aceptar descripción e inputText vacíos y completar los datos al analizar el archivo. La extracción de integrantes del archivo o de la descripción debe confirmarse e implementarse en el backend; el frontend permite revisar el resultado sin inventarlo.
4. POST `/projects/:id/runs`, `{ requireApproval: true }`, esperando `{ runId, status }`.
5. GET `/runs/:id` recupera estado y pasos; GET `/runs/:id/events` recibe eventos SSE `step`, `awaiting_approval`, `completed`, `failed` y `cancelled`.
6. GET `/projects/:id/board` recupera columnas y carga. Las prioridades `high/medium/low` y columna `in_progress` se adaptan al modelo visual local. El plan se importa solo si el tablero local está vacío, para conservar las ediciones manuales.
7. Tras revisión explícita, POST `/runs/:id/approve` continúa con DevOps y Notificador. Se pueden cancelar y reintentar ejecuciones.
8. GET `/projects/:id/environment` presenta repo y archivos. El adaptador espera `{ repoUrl, files }`; confirmar estos campos con el backend.

El tablero editado en el navegador sigue siendo local: todavía no envía movimientos ni cambios de tareas al backend. La aprobación corresponde al plan remoto original. Para evitar aprobar ediciones locales como si fueran remotas, revisar la carga y el plan de la ejecución antes de continuar. Cuando se integre persistencia compartida, conectar el tablero propio a los endpoints de tareas de Naatzo, sin servicios externos.

Los secretos de Gemini, GitHub y notificaciones pertenecen al servidor. No se agregaron credenciales, llamadas a proveedores ni simulaciones de ejecuciones exitosas. Un servidor ausente muestra errores reales y mantiene el tablero local utilizable.
