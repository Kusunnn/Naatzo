// src/demo/sample.js
// Minuta y equipo de ejemplo. Los usan POST /api/demo/seed y el modo mock.

const SAMPLE_PROJECT_NAME = "Reservas de canchas";

const SAMPLE_MINUTA = `Minuta reunion martes 6 oct - proyecto canchas
Asistentes: Ana, Luis, Laura, Diego y el profe Ramirez (coordinacion de deportes, es el cliente)

- El profe dice q los alumnos se pelean las canchas de futbol rapido y basquet, todo se apunta en una libreta en la caseta. Quiere una app web para reservar.
- Que se registren con su correo institucional (@tec.mx?) -> confirmar dominio
- Ver calendario de disponibilidad por cancha, en bloques de 1 hora, de 7 a 21
- Maximo 2 reservas activas por alumno
- El admin (el profe y 2 prefectos) tiene que poder bloquear horarios por torneos o mantenimiento
- Que llegue un correo de confirmacion al reservar (si da tiempo)
- Luis propone backend en Node con Express y base de datos Postgres; Ana hace el front en React con Vite. Todo en docker para que el profe lo pueda levantar en el server de la escuela
- Laura se encarga de disenar las pantallas de reserva y el panel admin
- Diego ve lo del docker y el despliegue
- Entrega: 20 de noviembre, demo con el profe
- Pendiente: no sabemos si hay que conectarse al login de la escuela (SSO) o hacer el nuestro
- Ojo: el profe quiere reporte de uso por cancha al final del semestre (no urgente)`;

// Equipo de 4 personas. Las horas estan pensadas para que en la demo se vea
// la asignacion por carga: Luis es el unico de backend, tiene pocas horas y
// termina arriba del 100%, y el codigo propone pasar tareas a quien tiene espacio.
const SAMPLE_TEAM = {
  name: "Equipo Naatzo Demo",
  members: [
    { name: "Ana", role: "Frontend", skills: ["frontend", "react", "diseno"], weeklyHours: 12, contact: { discord: "ana" } },
    { name: "Luis", role: "Backend", skills: ["backend", "node", "postgres"], weeklyHours: 6, contact: { discord: "luis" } },
    { name: "Laura", role: "Diseno UX y QA", skills: ["diseno", "qa", "frontend"], weeklyHours: 8, contact: { discord: "laura" } },
    { name: "Diego", role: "DevOps", skills: ["devops", "docker"], weeklyHours: 6, contact: { discord: "diego" } },
  ],
};

module.exports = { SAMPLE_PROJECT_NAME, SAMPLE_MINUTA, SAMPLE_TEAM };
