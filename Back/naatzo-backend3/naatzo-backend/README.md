# Naatzo Backend

Gestor de proyectos multiagente. Recibe una minuta o un correo sin estructura y, con cuatro agentes
(Analista, Planificador, DevOps y Notificador), genera tareas asignadas según la carga del equipo,
un tablero Kanban, un repositorio en GitHub con Docker y README, y un aviso al equipo por Discord.

La regla de todo el proyecto: **el modelo interpreta y redacta; el código calcula y ejecuta.**
Responsables, fechas y riesgos salen de `src/planning/` sin LLM, y los archivos del entorno salen de
plantillas en `src/templates/`. El LLM nunca decide qué comandos se ejecutan.

## Arranque rápido para el equipo

En `docs/` hay dos guías para el equipo: **`COMO_USARLO_SIN_DOCKER.txt`** (paso a paso para abrir con el Bloc de
notas) y **`Naatzo_Backend_Guia.pdf`** (qué hace el backend, el mismo paso a paso, problemas comunes y endpoints).

**Opción A: con Docker** (no necesitas instalar Postgres ni Node)

```bash
docker compose up --build
```

Levanta Postgres 16 y la API en http://localhost:4000, aplica las migraciones solo y arranca en modo
demo. Sin llaves, el LLM corre en mock. Si quieres usar llaves reales, crea un `.env` en esta carpeta con
`LLM_API_KEY=...`, `GITHUB_TOKEN=...`, etc. y vuelve a levantarlo. Para borrar la base:
`docker compose down -v`.

**Opción B: sin Docker** (Node 20.19+ y un Postgres propio): sigue "Cómo levantarlo" más abajo.

Para comprobar que funciona, abre http://localhost:4000/api/health o corre `bash scripts/demo.sh`.
La raíz http://localhost:4000 solo dice que la API está arriba: es un backend, no tiene páginas.

## Requisitos

- Node 20.19 o superior (Octokit 22 se carga con `require` de ESM)
- PostgreSQL 13 o superior (local, en Docker o en Supabase)
- Para `scripts/demo.sh`: bash (en Windows sirve Git Bash), curl y node

## Cómo levantarlo

```bash
npm install
cp .env.example .env
```

Edita `.env`. Lo mínimo:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `postgres://usuario:contrasena@localhost:5432/naatzo` |
| `DATABASE_SSL` | `false` en local, `true` en Supabase |
| `JWT_SECRET` | cualquier texto de 16 caracteres o más |
| `DEMO_MODE` | `true` para tener las rutas `/api/demo` |

Si no tienes Postgres, puedes levantar uno con Docker:

```bash
docker run -d --name naatzo-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=naatzo -p 5432:5432 postgres:16
```

Después:

```bash
npm run migrate
npm start
```

`npm run dev` arranca con `node --watch`. Las variables se validan con Zod al arrancar: si algo falta,
el servidor se detiene con un mensaje claro.

Si compartes el Supabase de KIBO 1, pon `DB_SCHEMA=naatzo`: así las tablas se crean en un esquema
aparte, porque ahí ya existe una tabla `tasks` con otra estructura.

## Probar todo de punta a punta

Con el servidor corriendo y `DEMO_MODE=true`:

```bash
bash scripts/demo.sh
```

El script crea (o reutiliza) el usuario `demo@naatzo.dev`, borra los datos de demo anteriores, carga el
equipo de 4 personas y la minuta de ejemplo, corre la ejecución mostrando los eventos SSE, enseña el
tablero con la carga por persona y las propuestas de reasignación, aprueba el plan, lista los archivos
generados, baja el ZIP, muestra el aviso de arranque, usa el tablero propio (mueve una tarjeta, le pone
etiqueta, checklist y comentario), invita a Laura y entra con su cuenta, replanifica con "Laura no puede
esta semana", adelanta el reloj 6 días y corre la revisión de
riesgos dos veces para comprobar que los avisos no se repiten.

Para otra URL: `API=http://otra-maquina:4000/api bash scripts/demo.sh`.

## Llaves y modo mock

Ninguna llave es obligatoria para probar.

| Servicio | Variable | Sin la variable |
|---|---|---|
| Gemini | `LLM_API_KEY` | Se usa el modo mock: respuestas fijas para la minuta de ejemplo |
| GitHub | `GITHUB_TOKEN` y `GITHUB_OWNER` | No se crea repo; el entorno queda como ZIP |
| Discord | `DISCORD_WEBHOOK_URL` | Los avisos quedan en el historial (`status: skipped`) para mostrarlos en pantalla |

- **Modo mock:** se activa con `LLM_PROVIDER=mock` o si `LLM_API_KEY` está vacía. Las respuestas fijas
  (`src/llm/mock.js`) pasan por la misma validación Zod que las del modelo.
- **Respaldo en la demo:** con `DEMO_MODE=true`, si Gemini no responde (sin internet, cuota o error),
  el agente usa la respuesta mock y lo registra en `agent_steps.model` como `mock-respaldo`.
- **Modelos:** `LLM_MODEL_FAST=gemini-3.5-flash-lite` (Analista, Notificador y texto del README) y
  `LLM_MODEL_SMART=gemini-3.8-flash` (Planificador). Si se acaba la cuota del modelo grande, el
  Planificador cambia al rápido. La llave va en el header `x-goog-api-key`.
- **GitHub:** token fine-grained con permisos de creación de repositorios (Administration) y Contents en
  escritura. `GITHUB_OWNER_TYPE=org` crea el repo en la organización; `user`, en tu cuenta. Los repos
  se crean públicos.
- `GET /api/health/integrations` dice qué está configurado, sin mostrar tokens. Sirve como lista de
  revisión antes de la demo.

## Cuentas para los miembros

Quien crea el equipo es el **dueño**. Los miembros (Ana, Luis...) pueden tener su propia cuenta y entrar al
tablero del equipo con su login:

1. El dueño invita a un miembro concreto: `POST /api/members/:id/invite` regresa un `code` y un
   `inviteUrl` (`FRONTEND_URL/invite/<code>`) que vence en 7 días. En la base solo queda el hash del código.
2. La persona ve a qué la invitan con `GET /api/invitations/:code` (sin token) y entra de dos formas:
   - se registra con el código: `POST /api/auth/register` con `inviteCode`;
   - o, si ya tiene cuenta, inicia sesión y llama `POST /api/invitations/:code/accept`.
3. Desde ahí ve el equipo en `GET /api/teams` y `GET /api/auth/me` (con su `role`), sus tareas en
   `GET /api/me/tasks`, y trabaja en el tablero. Todo lo que hace aparece con su nombre en la actividad y en
   vivo en los tableros abiertos.
4. El dueño quita el acceso con `DELETE /api/members/:id/account`.

| Acción | Dueño | Miembro con cuenta |
|---|---|---|
| Ver equipo, proyectos, tablero (y en vivo), actividad, ejecuciones, entorno y avisos | Sí | Sí |
| Crear, editar, mover, archivar y etiquetar tarjetas; checklist y comentarios | Sí | Sí |
| Registrar o quitar ausencias | De cualquiera | Solo las suyas |
| Arrancar, aprobar, reintentar o cancelar ejecuciones; replanificar | Sí | No (403) |
| Crear o borrar proyectos, cambiar la minuta, borrar tarjetas | Sí | No (403) |
| Administrar listas y etiquetas del tablero | Sí | No (403) |
| Agregar o editar miembros, invitar y quitar accesos | Sí | No (403) |

Quien no pertenece al equipo recibe 404, como si el recurso no existiera. Un usuario puede ser dueño de unos
equipos y miembro de otros; también el dueño puede ligarse a un miembro para tener "mis tareas".

## Replanificar con una frase

`POST /api/projects/:id/replan` recibe un aviso en lenguaje natural y recalcula el plan:

```bash
curl -X POST http://localhost:4000/api/projects/<id>/replan -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"event":"Laura no puede esta semana","preview":true}'
```

1. **El LLM interpreta** el aviso y lo convierte en cambios: ausencia (`unavailable`), horas por semana
   (`weekly_hours`), nueva entrega (`deadline`) o entrega movida N días (`deadline_shift`). El miembro solo
   puede ser alguien del equipo.
2. **El código aplica y recalcula** con las mismas piezas del Planificador:
   - las tareas en curso (En progreso, En revisión) se quedan con quien las trabaja;
   - las tareas por hacer que caían dentro de una ausencia pasan a otra persona con la misma habilidad
     (si nadie más la tiene, esperan a su responsable y se recorren las fechas);
   - las demás se quedan con su responsable mientras le alcance la capacidad;
   - las fechas se saltan los días de ausencia, y la capacidad se descuenta en el tablero y en la carga.
3. **El LLM redacta** qué se movió. Se registra en la actividad del tablero y se avisa al equipo
   (Discord o en pantalla).

Con `"preview": true` regresa el resultado sin guardar nada, para mostrarlo antes de confirmar. La respuesta
trae `understood`, `changes`, `skipped` (lo que no se pudo aplicar), `moved`, `rescheduledCount`,
`finishBefore`/`finishAfter`, `deadlineBefore`/`deadlineAfter`, carga, riesgos, propuestas y `explanation`.

Las ausencias se ven en `GET /api/teams/:id` (`members[].unavailability`) y se pueden agregar o quitar a mano
con `POST /api/members/:id/unavailability` y `DELETE /api/members/:id/unavailability/:absenceId`.

En modo mock, la frase se interpreta con palabras clave: entiende "X no puede esta semana / la próxima
semana / mañana / N días", "X ahora tiene N horas" y "el cliente adelantó (o retrasó) la entrega N días".

## Minuta como archivo

La minuta se puede pegar como texto o subir como **PDF, Word (.docx) o TXT**, de hasta 5 MB:

```bash
# Crear el proyecto directo desde el archivo
curl -X POST http://localhost:4000/api/projects -H "Authorization: Bearer $TOKEN" \
  -F teamId=<id-del-equipo> -F name="Reservas de canchas" -F file=@minuta.pdf

# Cambiar la minuta de un proyecto que ya existe
curl -X POST http://localhost:4000/api/projects/<id>/document -H "Authorization: Bearer $TOKEN" -F file=@minuta.docx
```

- El texto se extrae con pdf-parse (PDF, como en KIBO 1), mammoth (Word) o directo (TXT en UTF-8 o Latin-1).
- El formato se revisa por extensión y por los primeros bytes; un `.pdf` que no es PDF se rechaza.
- La respuesta trae `document` con nombre, formato, páginas, caracteres y una vista previa. El nombre
  queda en `project.inputFilename`.
- El Analista lee hasta 30,000 caracteres: si el archivo trae más, se corta y se avisa en `document.warning`.
- No se puede cambiar la minuta mientras hay una ejecución en curso (409).
- Un PDF escaneado (una foto del texto) no trae texto: responde 422 y pide pegar el texto. Leerlo
  necesitaría OCR, que no está.
- `.doc` viejos no se aceptan; hay que guardarlos como `.docx`.

## Cómo funciona una ejecución

`POST /api/projects/:id/runs` responde 202 y la cadena corre en segundo plano:

```
queued -> analyzing -> planning -> awaiting_approval -> provisioning -> notifying -> completed
                                                 (cualquier paso puede terminar en failed)
```

1. **Analista** (`src/agents/analyst.js`): extrae objetivo, stack, requerimientos, tareas mencionadas,
   fecha de entrega y dudas. La minuta va delimitada como dato. El código normaliza el stack contra el
   catálogo (`Node`, `NodeJS` o `Express` pasan a `node-express`); lo que no tiene plantilla queda como
   `generic`, y lo que falta toma un valor por defecto y se anota como duda.
2. **Planificador** (`src/agents/planner.js`): el LLM desglosa en módulos y tareas (habilidad limitada a
   las del equipo, de 1 a 16 horas, prioridad y dependencias). El código asigna por carga en orden
   topológico, calcula fechas en días hábiles, quita ciclos, detecta sobrecarga y entregas imposibles, y
   propone reasignaciones. El LLM solo redacta la explicación.
3. **Aprobación**: la ejecución espera `POST /api/runs/:id/approve`. Con `{"requireApproval": false}` al
   arrancar, este paso se salta.
4. **DevOps** (`src/agents/devops.js`): arma los archivos desde plantillas (node-express + postgres y
   react-vite), valida el `docker-compose.yml` con js-yaml (imágenes con versión fija, `postgres:16`),
   crea el repo con `auto_init: true` y sube todo en un solo commit con la API de Git. Si GitHub falla,
   el entorno queda en `GET /api/projects/:id/environment/zip`.
5. **Notificador** (`src/agents/notifier.js`): el LLM redacta un resumen corto; los links, números y fechas
   los pone el código en una plantilla. Se manda por webhook de Discord con una clave única por ejecución.

Toda salida del LLM se pide con `responseMimeType: "application/json"` + `responseSchema` y se valida con
Zod. Si la validación falla, se reintenta una vez mandando el error al modelo.

Cada paso queda en `agent_steps` con su entrada, salida, modelo, tokens y duración. `GET /api/runs/:id`
regresa esa traza, y el SSE manda primero la historia guardada para que no se pierda al recargar.

Después del arranque, node-cron revisa las tareas cada 10 minutos (`RISK_CHECK_CRON`) con `clock.now()`:
vencida, vence en 24 h, sin empezar a mitad del plazo o responsable arriba del 100%. Cada aviso lleva
la clave única `tarea:motivo:día` (o `miembro:sobrecarga:día`) en `notifications`, así que no se repite.

## Tablero propio (en lugar de Trello)

Naatzo no consume la API de Trello: el tablero vive en nuestra base y funciona igual.

- **Listas configurables** por proyecto (`board_lists`). Cada proyecto nace con *Por hacer*, *En progreso*,
  *En revisión* y *Hecho*, y el equipo puede crear, renombrar, reordenar y borrar listas.
- **Etapa por lista** (`todo`, `in_progress`, `review`, `done`). La tarjeta guarda la etapa de su lista en
  `board_column`, así la carga, los riesgos y el cron siguen funcionando aunque inventes listas como
  "Bloqueado". Si cambias la etapa de una lista, sus tarjetas cambian con ella.
- **Límite WIP** opcional por lista; el tablero marca `overWipLimit` cuando se pasa (no bloquea).
- **Tarjetas** (las tareas del plan): mover entre listas, archivar y restaurar, etiquetas de colores,
  checklist, comentarios, responsable, fechas y dependencias. Las tarjetas archivadas no cuentan para
  la carga ni para los avisos de riesgo.
- **Actividad**: cada cambio queda en `board_activity` con un mensaje listo para mostrar
  ("Ana movió X de Por hacer a En progreso").
- **Tiempo real**: `GET /api/projects/:id/board/events?token=...` manda por SSE cada cambio del tablero
  (`card_moved`, `comment_added`, `list_created`, `plan_generated`...), para que dos pantallas vean lo
  mismo sin recargar.

## Endpoints

Todas las rutas van bajo `/api`, responden `{ ok, ... }` y piden `Authorization: Bearer <token>`, menos
`/auth/*` y `/health*`. Cada consulta se filtra por el usuario del token; lo que es de otra persona
responde 404.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health`, `/health/db`, `/health/integrations` | Salud del servidor, de Postgres y de las integraciones |
| POST | `/auth/register`, `/auth/login` | Regresan `{ token, user }`; register acepta `inviteCode` |
| GET | `/auth/me` | Usuario del token y sus equipos (`role`: owner o member) |
| POST / GET | `/teams` | Crea / lista equipos |
| GET | `/teams/:id` | Equipo con miembros y horas abiertas |
| POST | `/teams/:id/members` | Agrega miembro: `name, role, skills[], weeklyHours, contact` |
| GET | `/teams/:id/workload` | Horas asignadas contra capacidad por persona |
| PATCH / DELETE | `/members/:id` | Edita o quita un miembro |
| POST / GET | `/projects` | Crea (`teamId, name, inputText, deadline?`, o `file` en multipart) / lista proyectos |
| POST | `/projects/:id/document` | Reemplaza la minuta con un archivo (multipart, campo `file`) |
| POST | `/projects/:id/replan` | Recalcula el plan ante un aviso: `{ "event": "Ana no puede esta semana", "preview": true }` |
| POST / DELETE | `/members/:id/unavailability` (`/:absenceId`) | Registra / quita una ausencia: `{ startDate, endDate, reason? }` |
| POST | `/members/:id/invite` | (dueño) Invita al miembro: regresa `code` e `inviteUrl` (vence en 7 días) |
| DELETE | `/members/:id/account` | (dueño) Desliga la cuenta del miembro |
| GET | `/invitations/:code` | (sin token) Equipo y miembro de la invitación |
| POST | `/invitations/:code/accept` | Liga tu cuenta al miembro |
| GET | `/me/tasks` | Mis tareas abiertas en todos mis equipos, con riesgo |
| GET / DELETE | `/projects/:id` | Detalle con análisis, links y última ejecución / borra |
| POST | `/projects/:id/runs` | Arranca la cadena (202 con `runId`) |
| GET | `/runs/:id` | Estado y pasos guardados |
| GET | `/runs/:id/events?token=...` | Eventos en vivo por SSE |
| POST | `/runs/:id/approve` | Aprueba el plan |
| POST | `/runs/:id/retry` | Reintenta desde un paso: `{ "from": "devops" }` (por defecto, el que falló) |
| POST | `/runs/:id/cancel` | Cancela la ejecución |
| GET | `/projects/:id/board` | Listas con tarjetas, etiquetas, carga por persona, riesgos y propuestas |
| GET | `/projects/:id/board/events?token=...` | Cambios del tablero en vivo por SSE |
| GET | `/projects/:id/activity` | Historial del tablero (`?limit=50`) |
| GET | `/projects/:id/archived` | Tarjetas archivadas |
| POST | `/projects/:id/lists` | Crea lista: `{ title, stage, wipLimit? }` |
| PATCH / DELETE | `/lists/:id` | Renombra, cambia etapa o WIP / borra (`?moveTo=<listId>` si tiene tarjetas) |
| PATCH | `/lists/:id/move` | Reordena la lista: `{ "position": 1 }` |
| GET / POST | `/projects/:id/labels` | Etiquetas del proyecto / crea `{ name, color }` |
| PATCH / DELETE | `/labels/:id` | Edita / borra etiqueta |
| POST | `/projects/:id/tasks` | Agrega una tarjeta (`listId` opcional) |
| GET | `/tasks/:id` | Detalle: checklist, comentarios, dependencias y actividad |
| PATCH / DELETE | `/tasks/:id` | Edita / borra una tarjeta (revisa ciclos de dependencias) |
| PATCH | `/tasks/:id/move` | `{ "listId": "...", "position": 2 }` (o `{ "column": "done" }`) |
| POST | `/tasks/:id/archive`, `/tasks/:id/restore` | Archiva / restaura |
| PUT | `/tasks/:id/labels` | Etiquetas de la tarjeta: `{ "labelIds": [...] }` |
| POST | `/tasks/:id/checklist` | Agrega elemento: `{ text }` |
| PATCH / DELETE | `/checklist/:id` | `{ text?, done?, position? }` / borra |
| POST | `/tasks/:id/comments` | Comenta: `{ body }` |
| PATCH / DELETE | `/comments/:id` | Edita / borra tu comentario |
| GET | `/projects/:id/environment` | Archivos generados y URL del repo |
| GET | `/projects/:id/environment/file?path=...` | Contenido de un archivo |
| GET | `/projects/:id/environment/zip` | ZIP del entorno (acepta `?token=`) |
| GET | `/projects/:id/notifications` | Historial de avisos |
| POST | `/projects/:id/notifications/test` | Mensaje de prueba al canal |
| POST | `/notifications/check` | Fuerza la revisión de riesgos |
| POST | `/demo/seed` | Equipo de 4 personas y minuta de ejemplo (solo `DEMO_MODE=true`) |
| GET / POST | `/demo/clock` | Ve o adelanta el reloj: `{ "hours": 48 }` o `{ "reset": true }` |
| POST | `/demo/reset` | Borra los equipos de demo del usuario y regresa el reloj |

## Estructura

```
src/
  index.js            arranque, revisión de ejecuciones interrumpidas y cron
  app.js              helmet, CORS, límites (de KIBO 1) y montaje de rutas
  config/env.js       variables de entorno validadas con Zod
  db/                 pool de Postgres (de KIBO 1), migrate, acceso por dueño, carga y tablero
  routes/             auth, teams, projects, runs, board, tasks, environment, notifications, demo
  orchestrator/       runPipeline, estados, entradas por paso y bus de eventos para SSE
  agents/             analyst, planner, devops, notifier
  planning/           asignación por carga, orden topológico, fechas y riesgos (sin LLM)
  templates/          catálogo de stacks, node-express, react-vite y docker-compose
  integrations/       github, discord y registro de avisos
  llm/                cliente de Gemini, esquemas de salida y respuestas mock
  jobs/               revisión periódica de riesgos
  utils/              retry y key-pool (de KIBO 1), clock, errores y serialización
  demo/               minuta y equipo de ejemplo
migrations/           archivos .sql numerados
scripts/demo.sh       flujo completo con curl
```

## Pendiente para después del MVP

- Jira (`POST /projects/:id/sync`), Telegram y correo como canales. Trello ya no hace falta: el tablero es propio.
- Agente administrado (Antigravity) para verificar el repo en su sandbox (`DEVOPS_AGENT_MODE`).
- OCR para PDF escaneados y adjuntos en las tarjetas.
- `/api/integrations` para guardar tokens por equipo cifrados (la tabla ya existe).
- Proveedor de respaldo (Groq) cuando Gemini se cae; por ahora el respaldo en la demo es el modo mock.
