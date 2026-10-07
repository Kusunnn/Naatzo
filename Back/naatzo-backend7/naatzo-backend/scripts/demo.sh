#!/usr/bin/env bash
# scripts/demo.sh
#
# Corre el flujo completo de Naatzo de punta a punta con curl:
#   salud -> login -> seed -> ejecucion (SSE) -> aprobacion -> tablero y carga
#   -> entorno -> aviso -> tablero propio (mover, etiquetas, checklist, comentarios)
#   -> cuentas para miembros -> replanificar con una frase -> reloj +6 dias -> riesgos
#   -> modo automatico (sin intervencion humana, con alerta de riesgo)
#
# Requisitos: el servidor corriendo con DEMO_MODE=true, curl y node.
# Uso:  bash scripts/demo.sh
#       API=http://localhost:4000/api bash scripts/demo.sh

set -euo pipefail

API="${API:-http://localhost:4000/api}"
# Usuario de prueba de la demo (solo para el entorno local)
DEMO_NAME="${DEMO_NAME:-Equipo Demo}"
# Correos de prueba en example.com (dominio reservado: nunca llega nada). Para recibir
# los avisos de verdad: DEMO_EMAIL=tu@correo.com LAURA_EMAIL=otro@correo.com bash scripts/demo.sh
DEMO_EMAIL="${DEMO_EMAIL:-demo@example.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-naatzo-demo-123}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; [ -n "${SSE_PID:-}" ] && kill "$SSE_PID" 2>/dev/null || true' EXIT

# ─── Ayudantes ───────────────────────────────────────────────────────────────
title() { printf '\n==== %s ====\n' "$1"; }

# Lee JSON de stdin y evalua una expresion de JavaScript sobre "o".
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);const r=($1);console.log(typeof r==='string'?r:JSON.stringify(r,null,2))})"; }

get()  { curl -sS "$API$1" -H "Authorization: Bearer $TOKEN"; }
post() {
  local body="${2:-}"
  [ -z "$body" ] && body='{}'
  curl -sS -X POST "$API$1" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$body"
}

wait_status() { # espera a que la ejecucion llegue a alguno de los estados dados
  local want="$1" status=""
  for _ in $(seq 1 120); do
    status="$(get "/runs/$RUN_ID" | js 'o.run.status')"
    case " $want " in *" $status "*) echo "$status"; return 0;; esac
    sleep 1
  done
  echo "Tiempo agotado esperando $want (estado actual: $status)" >&2
  exit 1
}

# ─── 1. Salud ────────────────────────────────────────────────────────────────
title "1. Salud del servidor"
curl -sS "$API/health" | js 'o.ok ? "API en linea" : "API con problemas"'
curl -sS "$API/health/db" | js 'o.ok ? "Postgres conectado ("+o.latencyMs+" ms)" : o.error'
curl -sS "$API/health/integrations" | js '"LLM: "+o.integrations.llm.mode+" | GitHub: "+(o.integrations.github.configured?"si":"no (ZIP)")+" | Correo: "+(o.integrations.email.configured?"si ("+o.integrations.email.host+")":"no (en pantalla)")+" | demo: "+o.integrations.demoMode'

# ─── 2. Usuario ──────────────────────────────────────────────────────────────
title "2. Sesion"
LOGIN="$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")"
if ! echo "$LOGIN" | js 'o.ok' | grep -q true; then
  LOGIN="$(curl -sS -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$DEMO_NAME\",\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")"
fi
TOKEN="$(echo "$LOGIN" | js 'o.token')"
get "/auth/me" | js '"Sesion iniciada como "+o.user.name+" <"+o.user.email+">"'

# ─── 3. Datos de ejemplo ─────────────────────────────────────────────────────
title "3. Equipo y minuta de ejemplo"
post "/demo/reset" | js '"Datos de demo anteriores borrados: "+o.deletedTeams+" equipo(s)"'
SEED="$(post "/demo/seed")"
TEAM_ID="$(echo "$SEED" | js 'o.team.id')"
PROJECT_ID="$(echo "$SEED" | js 'o.project.id')"
echo "$SEED" | js 'o.team.members.map(m=>"- "+m.name+" ("+m.role+"): "+m.skills.join(", ")+", "+m.weeklyHours+" h/semana").join("\n")'
echo "Proyecto: $(echo "$SEED" | js 'o.project.name') ($PROJECT_ID)"

# La minuta tambien se puede subir como archivo (PDF, DOCX o TXT). Aqui se sube
# la misma minuta como .txt para crear un segundo proyecto.
get "/projects/$PROJECT_ID" | js 'o.project.inputText' > "$TMP/minuta.txt"
FILE_PROJECT="$(curl -sS -X POST "$API/projects" -H "Authorization: Bearer $TOKEN" \
  -F "teamId=$TEAM_ID" -F "name=Reservas (desde archivo)" -F "file=@$TMP/minuta.txt")"
FILE_PROJECT_ID="$(echo "$FILE_PROJECT" | js 'o.project.id')"
echo "$FILE_PROJECT" | js '"Proyecto creado desde archivo: "+o.document.filename+" ("+o.document.format+", "+o.document.chars+" caracteres)"'

# ─── 4. Ejecucion hasta la aprobacion ────────────────────────────────────────
title "4. Ejecucion: Analista y Planificador (eventos SSE)"
# Modo supervisado: se detiene antes de DevOps hasta que el dueno aprueba.
RUN_ID="$(post "/projects/$PROJECT_ID/runs" '{"mode":"supervised"}' | js 'o.runId')"
echo "runId: $RUN_ID"
curl -sSN "$API/runs/$RUN_ID/events?token=$TOKEN" > "$TMP/sse1.log" &
SSE_PID=$!
wait_status "awaiting_approval failed" > "$TMP/status"
sleep 0.5
kill "$SSE_PID" 2>/dev/null || true
SSE_PID=""
grep -E '^(event|data):' "$TMP/sse1.log" | sed 's/^/  /'
if grep -q failed "$TMP/status"; then
  get "/runs/$RUN_ID" | js '"La ejecucion fallo: "+o.run.error'
  exit 1
fi

# ─── 5. Tablero y carga ──────────────────────────────────────────────────────
title "5. Tablero y carga del equipo (calculado por codigo, sin LLM)"
BOARD="$(get "/projects/$PROJECT_ID/board")"
echo "$BOARD" | js 'o.lists.map(l=>l.title+": "+l.cards.length).join(" | ")'
echo "$BOARD" | js 'o.lists[0].cards.map(t=>"- "+t.title+" -> "+(t.assignee?t.assignee.name:"sin asignar")+" ("+t.estimateHours+" h, "+t.plannedStart+" a "+t.plannedEnd+")").join("\n")'
echo
echo "$BOARD" | js 'o.workload.map(w=>"  "+w.name.padEnd(6)+" "+String(w.assignedHours).padStart(5)+" / "+String(w.capacityHours).padStart(5)+" h  "+w.percent+"%"+(w.percent>100?"  <- sobrecarga":"")).join("\n")'
echo
echo "$BOARD" | js 'o.plan ? "Propuestas:\n"+o.plan.proposals.map(p=>"- "+p.message).join("\n")+"\n\nExplicacion: "+(o.plan.explanation||"-") : "Sin plan"'

# ─── 6. Aprobacion, DevOps y Notificador ─────────────────────────────────────
title "6. Aprobacion: DevOps y Notificador (SSE hasta completar)"
post "/runs/$RUN_ID/approve" | js '"Aprobado, estado: "+o.status'
# El stream manda la historia guardada y se cierra solo al completar o fallar.
curl -sSN --max-time 120 "$API/runs/$RUN_ID/events?token=$TOKEN" | grep -E '^(event|data):' | sed 's/^/  /' || true
get "/runs/$RUN_ID" | js '"Estado final: "+o.run.status+"\nTablero: "+o.run.links.board+"\nRepositorio: "+(o.run.links.repo||"no se creo")+(o.run.links.zip?"\nZIP: "+o.run.links.zip:"")'

# ─── 7. Entorno generado ─────────────────────────────────────────────────────
title "7. Entorno generado por DevOps (plantillas)"
get "/projects/$PROJECT_ID/environment" | js 'o.files.map(f=>"- "+f.path+" ("+f.bytes+" bytes)").join("\n")'
echo
echo "docker-compose.yml:"
get "/projects/$PROJECT_ID/environment/file?path=docker-compose.yml" | js 'o.content' | sed 's/^/  /'
curl -sS -o "$TMP/entorno.zip" -w "ZIP descargado: %{size_download} bytes\n" "$API/projects/$PROJECT_ID/environment/zip?token=$TOKEN"

# ─── 8. Aviso al equipo ──────────────────────────────────────────────────────
title "8. Aviso de arranque"
get "/projects/$PROJECT_ID/notifications" | js 'o.notifications.filter(n=>n.type==="inicio").map(n=>"["+n.channel+" / "+n.status+"] "+n.subject+"\nPara: "+(n.recipients.join(", ")||"nadie")+"\n"+n.message).join("\n\n")'

# ─── 9. Tablero propio ───────────────────────────────────────────────────────
title "9. Tablero propio: mover, etiquetar, checklist y comentar"
BOARD="$(get "/projects/$PROJECT_ID/board")"
CARD_ID="$(echo "$BOARD" | js 'o.lists[0].cards[0].id')"
CARD_TITLE="$(echo "$BOARD" | js 'o.lists[0].cards[0].title')"
DOING_ID="$(echo "$BOARD" | js 'o.lists.find(l=>l.stage==="in_progress").id')"
echo "Tarjeta: $CARD_TITLE"
curl -sS -X PATCH "$API/tasks/$CARD_ID/move" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"listId\":\"$DOING_ID\",\"position\":0}" | js '"Movida a: "+o.task.list.title'
LABEL_ID="$(post "/projects/$PROJECT_ID/labels" '{"name":"Urgente","color":"red"}' | js 'o.label.id')"
curl -sS -X PUT "$API/tasks/$CARD_ID/labels" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"labelIds\":[\"$LABEL_ID\"]}" | js '"Etiquetas: "+o.task.labels.map(l=>l.name+" ("+l.color+")").join(", ")'
ITEM_ID="$(post "/tasks/$CARD_ID/checklist" '{"text":"Escribir docker-compose.yml"}' | js 'o.item.id')"
post "/tasks/$CARD_ID/checklist" '{"text":"Probar docker compose up"}' > /dev/null
curl -sS -X PATCH "$API/checklist/$ITEM_ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"done":true}' > /dev/null
post "/tasks/$CARD_ID/comments" '{"body":"Arranco con esta hoy."}' > /dev/null
get "/tasks/$CARD_ID" | js '"Checklist: "+o.task.checklist.done+"/"+o.task.checklist.total+" | comentarios: "+o.task.comments.length'
get "/projects/$PROJECT_ID/board" | js 'o.lists.map(l=>l.title+": "+l.cards.length).join(" | ")'
echo "Actividad reciente:"
get "/projects/$PROJECT_ID/activity?limit=6" | js 'o.activity.map(a=>"- "+a.message).reverse().join("\n")'

title "10. Cuentas para miembros: Laura entra con su propio login"
LAURA_ID="$(get "/teams/$TEAM_ID" | js 'o.team.members.find(m=>m.name==="Laura").id')"
INVITE_CODE="$(post "/members/$LAURA_ID/invite" | js 'o.code')"
curl -sS "$API/invitations/$INVITE_CODE" | js '"Invitacion: "+o.invitation.teamName+" como "+o.invitation.memberName+" (de "+o.invitation.invitedBy+")"'
# La primera vez se registra con el codigo; si la cuenta ya existe, entra y acepta.
LAURA_EMAIL="${LAURA_EMAIL:-laura@example.com}"; LAURA_PASS="laura-demo-123"
REG="$(curl -sS -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Laura\",\"email\":\"$LAURA_EMAIL\",\"password\":\"$LAURA_PASS\",\"inviteCode\":\"$INVITE_CODE\"}")"
if echo "$REG" | js 'o.ok' | grep -q true; then
  LAURA_TOKEN="$(echo "$REG" | js 'o.token')"
else
  LAURA_TOKEN="$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$LAURA_EMAIL\",\"password\":\"$LAURA_PASS\"}" | js 'o.token')"
  curl -sS -X POST "$API/invitations/$INVITE_CODE/accept" -H "Authorization: Bearer $LAURA_TOKEN" > /dev/null
fi
curl -sS "$API/auth/me" -H "Authorization: Bearer $LAURA_TOKEN" | js '"Laura entra como: "+o.teams.map(t=>t.memberName+" en "+t.teamName+" ("+t.role+")").join(", ")'
echo "Mis tareas (vista de Laura):"
curl -sS "$API/me/tasks" -H "Authorization: Bearer $LAURA_TOKEN" | js 'o.tasks.slice(0,3).map(t=>"  - "+t.title+" ["+t.list+"] hasta "+t.plannedEnd).join("\n")'
# Mueve su segunda tarea; la primera cae en la ausencia del paso 11 y el replan la reasigna.
LAURA_CARD="$(curl -sS "$API/me/tasks" -H "Authorization: Bearer $LAURA_TOKEN" | js 'o.tasks.filter(t=>t.stage==="todo")[1].id')"
curl -sS -X PATCH "$API/tasks/$LAURA_CARD/move" -H "Authorization: Bearer $LAURA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"column":"in_progress"}' | js '"Laura movio \""+o.task.title+"\" a "+o.task.list.title'
curl -sS -X POST "$API/runs/$RUN_ID/approve" -H "Authorization: Bearer $LAURA_TOKEN" | js '"Laura intenta aprobar el plan: "+o.error'
get "/projects/$PROJECT_ID/activity?limit=1" | js '"El dueño ve en la actividad: "+o.activity[0].message'

title "11. Replanificar con una frase: \"Laura no puede esta semana\""
echo "Vista previa (no guarda nada):"
post "/projects/$PROJECT_ID/replan" '{"event":"Laura no puede esta semana","preview":true}' \
  | js '"  "+o.understood+"\n  Reasignaciones: "+(o.moved.map(m=>"\""+m.title+"\" "+m.from+" -> "+m.to).join("; ")||"ninguna")'
echo "Aplicado:"
post "/projects/$PROJECT_ID/replan" '{"event":"Laura no puede esta semana"}' \
  | js '"  "+o.changes.join("; ")+"\n  Reasignadas: "+o.moved.length+" | fechas recorridas: "+o.rescheduledCount+" | termina: "+o.finishBefore+" -> "+o.finishAfter+"\n  "+o.explanation'

title "12. Reloj simulado +6 dias y revision de riesgos"
post "/demo/clock" '{"hours":144}' | js '"Ahora (simulado): "+o.today+" (+"+o.offsetHours+" h)"'
post "/notifications/check" | js '"Tareas revisadas: "+o.checkedTasks+" | alertas nuevas: "+o.newAlerts+" | repetidas: "+o.duplicates'
get "/projects/$PROJECT_ID/notifications" | js 'o.notifications.filter(n=>n.type.startsWith("riesgo_")).map(n=>"- "+n.message+" ["+n.status+"]").join("\n") || "Sin alertas"'
echo
echo "Segunda revision (no debe repetir avisos):"
post "/notifications/check" | js '"alertas nuevas: "+o.newAlerts+" | repetidas: "+o.duplicates'
post "/demo/clock" '{"reset":true}' | js '"Reloj de vuelta a "+o.today'

# ─── 13. Modo automatico ─────────────────────────────────────────────────────
title "13. Modo automatico: corre solo y avisa si hay riesgo"
AUTO_RUN="$(post "/projects/$FILE_PROJECT_ID/runs" '{"mode":"automatic"}' | js 'o.runId')"
echo "Proyecto: Reservas (desde archivo) | runId: $AUTO_RUN"
RUN_ID="$AUTO_RUN" wait_status "completed failed" > "$TMP/status2"
# El stream manda la historia; se cierra solo al completar.
curl -sSN --max-time 60 "$API/runs/$AUTO_RUN/events?token=$TOKEN" | grep -E '^event:' | sed 's/^event: /  evento: /' | uniq || true
get "/runs/$AUTO_RUN" | js '"Estado: "+o.run.status+" (modo "+(o.run.mode==="automatic"?"automatico":"supervisado")+", sin intervencion humana)"'
get "/runs/$AUTO_RUN" | js 'o.run.risk ? "Alerta de riesgo:\n"+o.run.risk.risks.map(r=>"  - "+r.message).join("\n")+"\nPropuestas:\n"+o.run.risk.proposals.map(p=>"  - "+p.message).join("\n") : "Plan sin riesgos"'
get "/projects/$FILE_PROJECT_ID/notifications" | js 'o.notifications.filter(n=>n.type==="riesgo_plan").map(n=>"Aviso guardado: "+n.subject+" ["+n.channel+" / "+n.status+"]").join("\n")'

title "Listo"
echo "Proyecto: $PROJECT_ID"
echo "Token para seguir probando: export TOKEN=$TOKEN"
