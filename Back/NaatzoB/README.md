# Naatzo Backend (Express)

Backend principal de Naatzo con integracion hacia NaatzoE como motor del chatbot.

## Servicios

- Backend principal: `http://localhost:4000`
- NaatzoE (chatbot/logica IA): `http://localhost:3000`

## Requisitos

- Node.js 20.19+ (recomendado Node.js 22 LTS)
- NaatzoE configurado con su `.env` y su base de datos PostgreSQL/Supabase

## Instalacion

```bash
npm install
```

## Ejecucion

Backend principal:

```bash
npm run start
```

Microservicio chatbot:

```bash
npm run chatbot
```

Ese comando ahora levanta NaatzoE desde `../../NaatzoE/src/index.js`.

Ambos servicios a la vez:

```bash
npm run start:all
```

## Endpoints principales

### Health

- `GET /api/health`
- `GET /api/chatbot/health`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

Body ejemplo:

```json
{
  "name": "Ana",
  "email": "ana@naatzo.com",
  "password": "123456"
}
```

### Tasks

- `GET /api/tasks?userId=<id>`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/tasks/:id/reminders`

Body crear tarea:

```json
{
  "userId": "usr_xxx",
  "title": "Preparar examen",
  "description": "Repasar capitulo 3",
  "dueAt": "2026-05-20T18:00:00.000Z"
}
```

### Recomendaciones y biblioteca

- `GET /api/recommendations?taskTitle=react hooks&dueAt=2026-05-20T18:00:00.000Z`
- `GET /api/recommendations?taskId=<taskId>`
- `GET /api/books/search?q=productividad&limit=8`

### Notificaciones inteligentes

- `GET /api/notifications/:userId`

Devuelve alertas de 1 dia, 8h, 4h, 1h antes de la entrega con recomendacion de libro y mascot image.

### Chatbot (proxy desde backend principal)

- `POST /api/chatbot/chat`
- `POST /api/chatbot/files`
- `GET /api/chatbot/chat/:userId`

El frontend sigue hablando con estos endpoints de NaatzoB, pero NaatzoB traduce la solicitud al contrato de NaatzoE.

## Persistencia

- Backend principal: `data/db.json`

NaatzoB guarda localmente en `data/db.json`:

- tareas
- archivos subidos
- mapeo `userId -> sessionId` del chat

NaatzoE guarda el historial real del chat y los recursos ingeridos en PostgreSQL/Supabase.
Los usuarios individuales se guardan en `public.naatzo_users` de PostgreSQL/Supabase.

## Notas de integracion con NaatzoE

- `CHATBOT_SERVICE_URL` debe apuntar al servidor NaatzoE.
- La subida de archivos de NaatzoB usa `POST /ingest` de NaatzoE para convertir el texto en recurso consultable.
- El antiguo `chatbot-service/` se retiró: el chatbot activo es NaatzoE.

## Backend unificado: individual y equipos

La implementación de `naatzo-backendLL` ahora vive en `src/modules/team/`.
No se inicia un segundo Express ni un segundo puerto: ambos módulos usan
`http://localhost:4000`, el mismo `package.json` y el mismo `.env`.

- Individual: `/api/auth`, `/api/tasks`, `/api/notifications`, biblioteca y chatbot sin cambios.
- Equipos: `/api/team/auth`, `/api/team/teams`, `/api/team/projects`,
  `/api/team/runs`, `/api/team/tasks`, `/api/team/notifications`, etc.
- Comprobación: `/api/team/health`, `/api/team/health/db`, `/api/team/health/integrations`.

Las cuentas de equipos conservan su contrato `{ token, user }` y necesitan
`Authorization: Bearer <token>`. No son las cuentas individuales: estas tienen
otro formato de contraseña y persistencia. No se fusionaron usuarios ni datos.
Los clientes del antiguo backend de equipos deben añadir `/team` después de `/api`.
El frontend individual actual no necesita cambios; esta refactorización no crea
una interfaz nueva para equipos.

### Configuración y migración

En `.env` configura `TEAM_JWT_SECRET` con una clave aleatoria de al menos 32
caracteres. Es obligatoria en producción; en desarrollo se genera una temporal
y las sesiones de equipos dejan de ser válidas al reiniciar.

`TEAM_DB_SCHEMA=naatzo_team` aísla las tablas de equipos de las tablas actuales.
No se permite `public`. Reutiliza `DATABASE_URL`, o configura otra conexión con
`TEAM_DATABASE_URL`. Si ya tienes datos del backend de equipos en otro esquema,
configura `TEAM_DB_SCHEMA` con ese esquema antes de migrar; no se trasladan solos.

```bash
npm install
npm run migrate:team
npm run start:all
```

`migrate:team` aplica únicamente las migraciones de equipos al esquema elegido;
no modifica las tablas individuales. Sin migrar, el servidor arranca, pero las
rutas con datos de equipos no funcionan y no se activa su cron de riesgos.

Para IA de equipos configura `LLM_API_KEY`, `LLM_MODEL_FAST` y
`LLM_MODEL_SMART` en este `.env`; no se copian las claves de NaatzoE.
Sin clave, equipos conserva su modo mock. GitHub (`GITHUB_TOKEN`, `GITHUB_OWNER`)
y correo (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) son opcionales.

### Organización

```text
NaatzoB/
  src/app.js                 # API individual + montaje /api/team
  src/server.js              # Único listener HTTP
  src/db/createDatabase.js   # Cliente PostgreSQL compartido, esquemas aislados
  src/modules/team/          # Proyectos, tablero, agentes, integraciones y SQL
  scripts/start-all.js       # NaatzoB:4000 + NaatzoE:3000
  test/                      # Pruebas de coexistencia y aislamiento
```

Pruebas: `npm test`. El chatbot NaatzoE sigue en el puerto 3000.
El flujo de demostración anterior se conserva en `scripts/demo-team.sh`, ahora
con URL `/api/team`. Requiere `DEMO_MODE=true`; úsalo solo en una base de pruebas,
porque crea cuentas/equipos y ejecuta agentes e integraciones configuradas.

Nota de dependencias: `npm audit` conserva tres avisos moderados relacionados
con `mammoth → argparse → sprintf-js`. Se aplicaron las correcciones compatibles;
no se usó `--force`, porque propone degradar Mammoth a una versión incompatible.
La lectura DOCX se conserva. GitHub, SMTP y el pipeline completo de agentes no
se ejecutan en las pruebas de coexistencia para evitar efectos externos.
