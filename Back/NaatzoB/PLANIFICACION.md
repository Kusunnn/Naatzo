# Planificación del proyecto

El pipeline actual usa generación directa, no el ciclo de decisiones autónomas del Planificador experimental.

1. Relee integrantes y capacidad disponible.
2. Genera un plan basado en el análisis del documento: descripciones breves, criterios de aceptación y dependencias.
3. Valida estructura, dependencias y pertinencia de tecnologías mediante código. Solo solicita una segunda propuesta si hay errores. Los riesgos de carga o fecha se muestran sin disparar nuevas inferencias.
4. Guarda un único plan validado. Los borradores inválidos no reemplazan el tablero. Máximo dos primeras tareas por integrante.

El progreso se publica mediante SSE y se emite un aviso cada 15 segundos mientras el modelo genera. Son estados reales del proceso, no decisiones autónomas inventadas.

Se retiró el corte global de tres minutos que interrumpía al Planificador después del tiempo consumido por el Analista. Cada petición conserva el timeout del proveedor. No hay garantía de terminar todo en tres minutos.

DevOps decide entre GitHub para software y un canal de Teams propuesto para los demás proyectos. Teams aún no está integrado: no crea canales ni publica actividades. Ambas ramas generan un README con IA; si falla su redacción, se usa el contenido del proyecto y se registra la advertencia. GitHub mantiene la creación real de repositorios cuando está vinculado y ZIP como alternativa.

El Notificador genera el resumen con IA y utiliza el adaptador SMTP existente para enviar avisos al dueño y los integrantes. Si falla la redacción, aún intenta enviar el aviso con los datos del proyecto. La salida distingue enviado, fallido y correo no configurado.

Pruebas aisladas (sin repositorios ni correos reales):
`node --test test/fast-agents.test.js test/planner-autonomy-integration.test.js test/planner-criteria.test.js test/plan-grounding.test.js test/llm-retry.test.js`
