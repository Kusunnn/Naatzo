# Naatzo Backend (Express)

Backend principal de Naatzo con integracion hacia NaatzoE como motor del chatbot.

## Servicios

- Backend principal: `http://localhost:4000`
- NaatzoE (chatbot/logica IA): `http://localhost:3000`

## Requisitos

- Node.js 18+
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

- usuarios y tareas
- archivos subidos
- mapeo `userId -> sessionId` del chat

NaatzoE guarda el historial real del chat y los recursos ingeridos en PostgreSQL/Supabase.

## Notas de integracion con NaatzoE

- `CHATBOT_SERVICE_URL` debe apuntar al servidor NaatzoE.
- La subida de archivos de NaatzoB usa `POST /ingest` de NaatzoE para convertir el texto en recurso consultable.
- El directorio `chatbot-service/` sigue en el repo como implementacion anterior, pero el flujo activo de la app ya no depende de el.
