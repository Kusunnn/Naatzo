# Pruebas con PostgreSQL local

Base: `naatzo_local`, en `127.0.0.1:5432`. Los archivos `.env` de
`Back/NaatzoB` y `NaatzoE` deben tener el mismo `DATABASE_URL` y `DATABASE_SSL=false`.
La configuración local de esta máquina ya está preparada.

Login de prueba: **test@test.com**, contraseña **12345**.

Requisitos: PostgreSQL con la extensión pgvector disponible y dependencias
instaladas en ambos backends. Para preparar el esquema y restablecer la
contraseña del usuario de prueba, desde la raíz:

```bash
node scripts/setup-local-db.cjs
```

El script solo acepta una conexión local a `naatzo_local`. Crea las tablas del
tutor, usuarios y tareas, y un usuario compatible con ambos backends.
Puedes repetirlo sin borrar datos. No importa contenido de la base remota.
Para otra máquina, configura tu usuario de PostgreSQL en ambos `.env`.

Para ejecutar los servicios:

```bash
cd Back/NaatzoB
npm run start:all
```

En otra terminal, desde la raíz:

```bash
cd Front/NaatzoF
npm run dev
```

El frontend usa el backend en `http://localhost:4000/api`; el tutor corre en
`http://localhost:3000`. La base es local; las funciones de IA siguen usando
el proveedor configurado en `NaatzoE/.env`.

## Actualización del branding

Las carpetas ahora son `Front/NaatzoF`, `Back/NaatzoB` y `NaatzoE`.
En esta máquina se renombró la base local a `naatzo_local` conservando los datos,
y se actualizaron ambos `.env`.

Para actualizar otra instalación existente, conserva su `DATABASE_URL` hasta
renombrar su base o migrar sus datos. Cambiar solo la URL no traslada los datos.
El backend ejecuta automáticamente la migración de la tabla de usuarios al
iniciar. La sesión guardada del navegador se migra a `naatzo-user` al abrir la app.
