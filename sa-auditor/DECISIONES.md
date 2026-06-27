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
