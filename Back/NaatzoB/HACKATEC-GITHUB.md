# GitHub para la presentación

1. En GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Nombre: Naatzo Hackatec. Homepage: `http://localhost:5173`. Callback: `http://localhost:4000/api/team/integrations/github/callback` (el flujo por código no usa este callback).
3. En los ajustes de la OAuth App activa **Enable Device Flow**.
4. Copia el **Client ID** (no necesitas generar Client Secret para este flujo).
5. En `Back/NaatzoB/.env` agrega `GITHUB_CLIENT_ID=tu_client_id` y reinicia el backend.
6. En Asistentes del proyecto → Conectar GitHub, copia el código, abre GitHub y autoriza. Regresa y pulsa **Ya autoricé, comprobar conexión**.
7. Revisa el plan y apruébalo. DevOps crea un repositorio público en la cuenta conectada del propietario del equipo, sube los archivos y muestra la URL.

La autorización solicita `public_repo`: permite administrar repositorios públicos de la cuenta, no solo el nuevo. Usa una cuenta de pruebas para la presentación. La conexión se almacena únicamente en memoria del servidor y caduca como máximo a las 8 horas; reiniciar obliga a reconectar. Desconectar borra la conexión local, pero para revocar el permiso en GitHub usa Settings → Applications → Authorized OAuth Apps.

Si no hay conexión personal se conserva el modo anterior con `GITHUB_TOKEN`/`GITHUB_OWNER`; sin ninguno, se entrega ZIP. Los usuarios invitados no se agregan automáticamente al repositorio. No se crean repositorios al conectar: solo después de aprobar el plan. Esta versión no reemplaza una integración con permisos granulares para producción.
