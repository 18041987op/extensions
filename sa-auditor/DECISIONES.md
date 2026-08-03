# Decisiones / Notas técnicas — SA Auditor

Registro de decisiones para no repetir investigaciones ya hechas.

---

## 2026-06-27 — ⛔ EN PAUSA: Inspecciones / Technician Concerns (DVI)

### Qué queríamos hacer
Mostrar en la extensión las **recomendaciones del técnico** tal como aparecen en
Tekmetric (pestaña *Estimate → Vehicle Issues / Technician Concerns*):
- Cada concern con su **severidad** (🔴 crítico / 🟡 recomendado).
- El **hallazgo** (texto) y las **fotos/media**.
- Los **customer concerns**.
- Relacionarlas con los **jobs estimados** que salen de ellas (Copy to Estimate).

Objetivo: que el SA vea lo que el técnico recomendó para **venderlo / dar seguimiento**
(upsell), incluso las recomendaciones que aún NO se convirtieron en job.

### Por qué se pausó (bloqueante real, no es trabajo pendiente nuestro)
La data de inspecciones **NO está disponible** por ninguna vía que controlemos:

1. **API pública de Tekmetric:** sus recursos son **Shops, Customers, Vehicles,
   Repair Orders, Jobs, Appointments, Employees, Inventory (beta)**.
   **No expone inspecciones / DVI / concerns / findings.**
2. **Supabase C (`tekmetric-integration C`, kiziudyqjnihywbmgsqn):** tiene exactamente
   ese conjunto de tablas (customers, vehicles, repair_orders, jobs, job_line_items,
   appointments, employees). Sin inspecciones. No falta sincronizar: la API no lo da.
3. **Supabase B (`AutoRx Portal`, xvegcjulcrdnkjfwssrf):** revisadas ~130 tablas y
   columnas con `inspect/concern/finding/severity/dvi/rating`. **No hay datos de DVI**
   (las coincidencias eran de RRHH y de la IA Emma).

Verificado el 2026-06-27 con `information_schema`, dos clientes MCP comunitarios de la
API de Tekmetric (mismo set de recursos, sin inspections) y la doc pública.

### Condición para RETOMAR
Solo reintentar cuando **Tekmetric exponga un endpoint de inspecciones/DVI** en su API
(privado/beta o GA). Pasos cuando exista:
1. Confirmar el endpoint con el developer program de Tekmetric (`api.tekmetric.com`).
2. Agregarlo al **pipeline de sincronización** (el servicio que llena Supabase C),
   creando p. ej. `tekmetric_inspections` + `tekmetric_inspection_items`
   (severidad, finding, media URLs, ro_id, vehicle_id).
3. Recién entonces extender `ro_audit` / una vista nueva y el UI de la extensión.

**Hasta entonces: NO volver a intentar leer inspecciones desde la API/DB.**

### Alternativa que SÍ es viable (con datos actuales)
Las recomendaciones convertidas en **jobs del estimado** sí están en `tekmetric_jobs`:
- `authorized = true` → **Approved** (vendido).
- `selected = true, authorized = false` → **Pending approval** (recomendado, sin vender).
- `selected = false` → **Turned off** (opción apagada/rechazada).
- Monto por job en `total_amount` (dólares; ej. Oil Change = 78.66).

Idea pendiente (no construida aún): chip/filtro **"$ unsold"** = suma de jobs
*Pending approval* por RO/SA, para perseguir el upsell. Esto NO depende de inspecciones.

---

## 2026-07-30 — ✅ "$ unsold" construido + descubrimiento: customerConcerns SÍ trae comentario del técnico

### Qué se construyó (v0.8.0)
1. **💰 "$ unsold" (por vender)** — la idea pendiente de la nota anterior, ya implementada:
   - `ro_audit`: `unsold_jobs`, `unsold_amount`, `unsold_jobs_list` (título + monto de
     cada job *Pending approval*: `selected=true, authorized=false, authorized_date null`).
   - `sa_rollup`: `unsold_amount`, `c_unsold`, `c_concern_no_estimate` por SA.
   - Extensión: chip 💰 en la tarjeta del RO, desglose en el detalle, barra con el total
     por SA/admin, monto por SA en el acordeón del admin y filtro **"$ Unsold"**.
   - Dashboard: KPI "$ por vender", monto por SA en las tarjetas y chip por RO.

2. **"Concern sin estimado"** (`concern_no_estimate`) — nueva regla de auditoría:
   el RO tiene *customer concerns* (razón de visita) pero **cero jobs creados**
   (`jobs_any = 0`, contando incluso apagados/declinados) ⇒ probablemente el SA no ha
   creado el estimado. Chip rojo en extensión y dashboard. El detalle del RO ahora
   muestra **🗣 Reason for visit**: cada concern + el comentario del técnico.

### Descubrimiento importante (matiza la pausa de DVI del 2026-06-27)
El `raw_data` de `tekmetric_repair_orders` **SÍ trae `customerConcerns`**:
`[{id, concern, techComment}]` — la razón de visita del cliente Y el **comentario/
recomendación del técnico sobre ese concern**. Cobertura verificada el 2026-07-30:
89/103 Estimates, 29/39 WIP, 9/10 Completed con concerns.

Esto NO es el DVI completo (sigue sin haber severidades 🔴/🟡, fotos, ni los findings
de inspección que no nacen de un concern — eso sigue bloqueado hasta que Tekmetric
exponga inspections en su API). Pero cubre el caso principal de seguimiento:
*qué dijo el cliente al llegar y qué opinó el técnico al respecto*.

### Notas técnicas
- `jobs_any` (todos los jobs, incl. apagados) vs `jobs_total` (solo `selected=true`):
  `concern_no_estimate` usa `jobs_any=0` para no disparar cuando ya se creó algo
  aunque esté apagado o declinado.
- `has_unsold` NO es columna de la vista: se calcula en JS (`unsold_amount > 0`)
  para poder usarlo como pseudo-issue en los filtros de la extensión.
- `concern_no_estimate` se sumó a `ros_with_issues` del rollup (afecta el conteo de
  las tarjetas por SA del dashboard); `mandatory_issues` quedó igual.

---

## 2026-07-30 — 🐛 Jobs fantasma: el sync NUNCA marca jobs borrados (v0.8.1)

### El bug (encontrado con el RO #70774)
Thalia creó el job "Remove & Replace Camshaft" (4:40 PM) y lo **eliminó** 8 minutos
después (4:48 PM, consta en el Activity de Tekmetric). Nuestra tabla `tekmetric_jobs`
lo mantuvo **vivo**: el sync incremental pide "jobs modificados desde X", y un job
borrado simplemente **deja de venir** en el API — nadie le pone `deleted_at`. La
extensión mostraba $6,985 unsold cuando lo real era $4,582.73, y con el banner verde
"looks complete": doble engaño al SA.

**Magnitud medida ese día: 20 de 152 ROs activos** tenían jobs fantasma (deltas de
$27 hasta $10k). No es un caso raro; pasa cada vez que un SA borra o re-crea un job.

### Detección implementada (workaround honesto, no el fix de raíz)
El RO **sí** se re-sincroniza al cambiar, y sus `labor_sub_total` / `parts_sub_total`
excluyen jobs borrados Y declinados. Nueva columna `jobs_out_of_sync` en `ro_audit`:

    suma de jobs "vivos" (selected=true y no declinados: authorized o sin
    authorized_date) por RO  vs  subtotales del propio RO; difieren > $1 ⇒ true

Hipótesis validada contra la flota: comparando contra TODOS los jobs había 42
mismatches; excluyendo declinados quedaron 20 — los 20 son fantasmas reales (todos
los deltas negativos = nuestra tabla suma de más). El umbral $1 absorbe redondeos.

UI: chip rojo "Data out of sync" (extensión) / "Datos desincronizados" (dashboard),
cuenta como issue obligatorio (un RO con datos no confiables jamás se muestra ✓),
y la lista de unsold lleva advertencia de verificar en Tekmetric. `c_out_of_sync`
en `sa_rollup`.

También v0.8.1: el banner del RO actual ya **no dice "✓ looks complete" si hay
unsold** — muestra ámbar "Documented, but 💰 $X pending approval — not done until
it's sold (or declined)". (Feedback directo del dueño: el verde daba por bueno
un RO con dinero sin vender.)

### Fix de raíz PENDIENTE (vive en el servicio de sync, no en este repo)
El sync corre fuera de Supabase (no hay edge functions en el proyecto C). Cuando se
toque ese servicio: al sincronizar un RO modificado, pedir **todos** sus jobs
(`GET /jobs?repairOrderId=X`) y poner `deleted_at=now()` a las filas locales de ese
RO que ya no vengan en la respuesta. Con eso `jobs_out_of_sync` debería quedar
siempre false y se puede degradar el chip a advisory.

### Limpieza manual hecha
Solo el caso probado: job 1226971044 ("Remove & Replace Camshaft", RO 70774) marcado
`deleted_at` a mano el 2026-07-30 (evidencia: Activity log + delta exacto de
$2,402.40 en labor). Los otros ~19 ROs quedaron con el chip de advertencia — NO
adivinar cuál job es el fantasma; el fix de sync los limpiará.

---

## 2026-07-30 — 🚩 tech_warning: el técnico sugiere OTRO camino de reparación (v0.8.2)

### Idea (pedida por el dueño)
Advertir al SA cuando el comentario del técnico contradice el camino de venta:
seguir vendiendo reparaciones a un motor que el técnico ya dijo que conviene
reemplazar, un vehículo "not safe to drive", o un RO bloqueado ("can't do
anything until X"). Caso disparador: RO 70774/70758 — reparaciones de $6-8k
mientras el técnico escribió "repairing this engine could be more expensive
than replacing it".

### Implementación
`tech_warning` (bool) en `ro_audit` + `warn` por concern dentro de `concerns`:
regex case-insensitive sobre `customerConcerns[].techComment` que busca:
- reemplazo mayor: "replace the engine/transmission/motor" (con guardas para NO
  disparar con "engine oil / air filter / transmission fluid"), "engine|
  transmission ... needs/recommended to be replaced / replacement is recommended"
- viabilidad: "more expensive than", "not worth fixing/repairing/it"
- seguridad: "not safe to drive", "unsafe to drive"
- bloqueos: "can't do anything"
- español: "cambiar el motor/transmisión", "no es seguro"

**Calibrada contra el corpus real el 2026-07-30: 5 aciertos / 0 falsos positivos**
(70758 y 69312 motor, 70705 transmisión con $14k unsold!, 70534 not safe to
drive, 70519 bloqueado por radio). Ojo al ajustar: "replaced the front brake
pads", "thermostat replacement", "fuel tank replacement" NO deben disparar.

UI: chip rojo "🚩 Tech: check path" (ext) / "🚩 Técnico sugiere otro camino"
(dashboard) + el concern culpable resaltado en rojo en "Reason for visit" con
nota de alinear con el cliente antes de seguir vendiendo por el camino actual.
`c_tech_warning` en `sa_rollup`; cuenta en `ros_with_issues`. Advisory (no
mandatory): pide criterio del SA, no es dato faltante.

### Límite conocido
Solo ve los `techComment` de los customer concerns — los findings de inspección
que no nacen de un concern siguen bloqueados (DVI, ver nota 2026-06-27). Si el
técnico solo escribió la advertencia en el finding del DVI, no la vemos.

## 2026-08-03 — UX v0.8.5: semántica de color, sync lag informativo, notas del técnico recortadas, versión visible

Feedback de Osman usando la extensión publicada (Published-unlisted en la
Web Store) sobre el RO 70757:

1. **Verde = completo, ámbar = pendiente.** El bloque "Pending approval
   (unsold)", el moneybar, el chip 💰 y el total por SA eran verdes — leían
   como "todo bien" cuando en realidad es dinero que falta por vender. Todo
   lo unsold pasa a ámbar (paleta `med`). El verde queda reservado para
   estados completos/OK (✓ Complete, All caught up, badge cero).

2. **"Data out of sync" → "⏱ Sync lag" informativo.** El chip rojo creaba
   duda sin salida: desde Tekmetric no se puede forzar el sync, así que
   alarmar no aporta. Cambios: sale de MANDATORY_KEYS y de RO_LEVEL_KEYS
   (ya no cuenta como "thing to fix" ni mete el RO en la lista de
   pendientes por sí solo), severidad low, chip gris propio, y un
   explicador en la tarjeta: Tekmetric es la fuente de la verdad, sus
   números son los correctos, se resuelve solo con un sync futuro, nada
   que arreglar en el RO. El aviso dentro del bloque unsold se reescribió
   igual de claro ("quote from Tekmetric's numbers, not these").
   El fix de raíz sigue pendiente en el servicio de sync (reconciliar
   deletes); cuando llegue, este chip desaparece solo.

3. **Notas del técnico a 2 líneas.** En "Reason for visit" el techComment
   completo enterraba la respuesta al concern. Notas >160 chars se
   recortan a 2 líneas (line-clamp) con botón "Show full note ▾/▴".
   El 🚩 tech_warning sigue mostrándose completo aparte (no se recorta el
   flag, solo la nota). Resumir la nota a "la respuesta al concern" de
   verdad requeriría IA en el pipeline de sync — anotado como mejora
   futura, no se hace en el cliente.

4. **Versión visible.** El footer del panel ahora muestra `· v0.8.5`
   (desde chrome.runtime.getManifest()). Así se sabe al instante qué
   versión corre en cada máquina cuando la Web Store propaga un update
   (Chrome chequea updates cada ~5 horas; forzable en chrome://extensions
   → Developer mode → Update).

**Regla de proceso (pedida explícitamente): no quitar features al
actualizar.** Antes de tocar UI, revisar este archivo y el diff completo de
content.js/panel.css para no perder comportamientos ya decididos. Lo bueno
se mantiene; solo se mejora lo señalado.
