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
