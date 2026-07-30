-- ============================================================
-- SA Auditor — vistas de auditoría (solo lectura)
-- Proyecto Supabase "tekmetric-integration C" (kiziudyqjnihywbmgsqn).
-- security_invoker=false: las vistas corren como su dueño y agregan datos,
-- exponiendo SOLO lo necesario (sin teléfono/email del cliente).
--
-- Estados (las 3 columnas del tablero de Tekmetric):
--   ESTIMATE            -> Estimates        (baja prioridad)
--   REPAIR_IN_PROGRESS  -> Work In Progress (obligatorio: todo completo)
--   COMPLETE            -> Completed         (obligatorio: todo completo)
--
-- Estados de un JOB dentro del RO (se derivan de authorized / selected / authorized_date):
--   authorized=true                                  -> APROBADO (pulgar verde). Se audita.
--   authorized=false, authorized_date IS NOT NULL    -> DECLINADO (cliente rechazó). NO se audita.
--   authorized=false, authorized_date IS NULL, sel=t -> PENDIENTE (sin aprobar). NO se audita.
--   selected=false                                   -> APAGADO (opción rechazada). Advisory.
-- La auditoría obligatoria (banderas + problem_jobs activos) corre SOLO sobre jobs
-- APROBADOS. Las partes (tekmetric_job_line_items.job_tekmetric_id) se ligan a su job,
-- así que jobs declinados/pendientes/apagados no contaminan las banderas del RO.
--
-- Notas de datos:
--   * tekmetric_customers.address es jsonb a veces doble-codificado (string).
--   * El RO NO trae appointmentId fiable; waiter (appointmentOption STAY) y hora
--     de entrega (pickupTime) se cruzan best-effort por vehículo+fecha (cobertura
--     parcial hasta mejorar el sync).
--   * Los CTE se filtran a los ROs activos ANTES de agregar/decodificar jsonb,
--     para evitar timeouts (57014).
--
-- Deshacer: drop view public.tech_board; drop view public.sa_rollup; drop view public.ro_audit;
-- ============================================================

drop view if exists public.tech_board;
drop view if exists public.sa_rollup;
drop view if exists public.ro_audit;

create view public.ro_audit
with (security_invoker = false) as
with active_ro as (
  select * from public.tekmetric_repair_orders
  where deleted_at is null and status in ('ESTIMATE','REPAIR_IN_PROGRESS','COMPLETE')
),
-- Un row por JOB (incluye apagados). sel=false => "apagado" (opción rechazada).
jobx as (
  select j.repair_order_id, j.tekmetric_id as job_id, j.name as title,
    j.authorized, j.labor_hours, coalesce(j.selected,false) as sel,
    (j.authorized and j.technician_id is null)     as no_tech,
    (j.authorized and coalesce(j.labor_hours,0)=0) as no_labor,
    coalesce(bool_or(li.line_type ilike '%part%' and (li.unit_price is null or li.unit_price=0)),false) as no_price,
    coalesce(bool_or(li.line_type ilike '%part%' and (li.unit_cost  is null or li.unit_cost =0)),false) as no_cost,
    coalesce(bool_or(li.line_type ilike '%part%' and (li.quantity   is null or li.quantity  =0)),false) as no_qty
  from public.tekmetric_jobs j
  left join public.tekmetric_job_line_items li
    on li.job_tekmetric_id = j.tekmetric_id and li.deleted_at is null
  where j.deleted_at is null and coalesce(j.archived,false)=false
    and j.repair_order_id in (select tekmetric_id from active_ro)
  group by j.repair_order_id, j.tekmetric_id, j.name, j.authorized, j.labor_hours, j.selected, j.technician_id
),
jobagg as (
  -- Auditoría obligatoria = SOLO jobs APROBADOS (j.authorized). Esto excluye:
  --   · Declinados: authorized=false con authorized_date puesta (cliente rechazó).
  --   · Pendientes: authorized=false sin authorized_date (recomendación sin aprobar).
  -- Los apagados (selected=false) se reportan aparte como advisory.
  select repair_order_id,
    count(*) filter (where sel)        as jobs_total,
    count(*) filter (where authorized) as jobs_authorized,
    round(coalesce(sum(labor_hours) filter (where authorized),0),2) as labor_hours,
    coalesce(bool_or(no_tech)  filter (where authorized),false) as auth_job_without_tech,
    coalesce(bool_or(no_labor) filter (where authorized),false) as auth_job_without_labor,
    coalesce(bool_or(no_price) filter (where authorized),false) as part_without_price,
    coalesce(bool_or(no_cost)  filter (where authorized),false) as part_without_cost,
    coalesce(bool_or(no_qty)   filter (where authorized),false) as part_without_qty,
    coalesce(bool_or((no_price or no_cost or no_qty)) filter (where not sel),false) as off_jobs_with_errors,
    coalesce(
      jsonb_agg(jsonb_build_object('title', title, 'issues', to_jsonb(arr), 'off', not authorized)
                order by (not authorized), title)
      filter (where (authorized or not sel) and coalesce(array_length(arr,1),0) > 0),
      '[]'::jsonb
    ) as problem_jobs
  from (
    select q.*, array_remove(array[
      case when no_tech  then 'No tech'             end,
      case when no_labor then 'No labor'            end,
      case when no_price then 'Part: no sale price' end,
      case when no_cost  then 'Part: no cost'       end,
      case when no_qty   then 'Part: no qty'        end
    ], null) as arr
    from jobx q
  ) z
  group by repair_order_id
),
cust as (
  select c.tekmetric_id,
    case when jsonb_typeof(c.address)='string' then (c.address #>> '{}')::jsonb else c.address end as addr
  from public.tekmetric_customers c
  where c.tekmetric_id in (select customer_id from active_ro)
),
meta as (
  select x.tekmetric_id,
    case when jsonb_typeof(x.jj->'repairOrderLabel')='string'       then (x.jj->'repairOrderLabel'#>>'{}')::jsonb       else x.jj->'repairOrderLabel'       end as lab,
    case when jsonb_typeof(x.jj->'repairOrderCustomLabel')='string' then (x.jj->'repairOrderCustomLabel'#>>'{}')::jsonb else x.jj->'repairOrderCustomLabel' end as clab
  from (
    select r.tekmetric_id,
      case when jsonb_typeof(r.raw_data)='string' then (r.raw_data #>> '{}')::jsonb else r.raw_data end as jj
    from active_ro r
  ) x
),
appt_raw as (
  select a.vehicle_id, a.start_time,
    case when jsonb_typeof(a.raw_data)='string' then (a.raw_data #>> '{}')::jsonb else a.raw_data end as j
  from public.tekmetric_appointments a
  where a.deleted_at is null and a.vehicle_id in (select vehicle_id from active_ro)
),
appt_best as (
  select distinct on (ro.tekmetric_id) ro.tekmetric_id,
    ar.j->'appointmentOption'->>'code' as appt_option,
    nullif(ar.j->>'pickupTime','') as pickup_time
  from active_ro ro
  join appt_raw ar on ar.vehicle_id = ro.vehicle_id
   and ar.start_time between ro.tekmetric_created_at - interval '10 days' and ro.tekmetric_created_at + interval '3 days'
  order by ro.tekmetric_id, abs(extract(epoch from (ar.start_time - ro.tekmetric_created_at)))
)
select
  r.tekmetric_id           as ro_id,
  r.repair_order_number    as ro_number,
  r.status,
  r.tekmetric_created_at   as ro_created_at,
  coalesce(nullif(trim(e.full_name),''), nullif(trim(concat_ws(' ', e.first_name, e.last_name)),''), 'Unassigned') as service_advisor,
  r.service_writer_id,
  nullif(trim(concat_ws(' ', v.year::text, v.make, v.model)),'') as vehicle,
  (v.vin is null or length(trim(v.vin)) < 17)      as missing_vin,
  (r.miles_in is null or r.miles_in = 0)           as missing_miles,
  (nullif(trim(cu.addr->>'address1'),'') is null and nullif(trim(cu.addr->>'fullAddress'),'') is null) as missing_address,
  coalesce(ja.jobs_total,0)                        as jobs_total,
  coalesce(ja.jobs_authorized,0)                   as jobs_authorized,
  coalesce(ja.labor_hours,0)                       as labor_hours,
  coalesce(ja.auth_job_without_tech,false)         as auth_job_without_tech,
  coalesce(ja.auth_job_without_labor,false)        as auth_job_without_labor,
  coalesce(ja.part_without_price,false)            as part_without_price,
  coalesce(ja.part_without_cost,false)             as part_without_cost,
  coalesce(ja.part_without_qty,false)              as part_without_qty,
  (coalesce(ja.jobs_total,0) > 0 and coalesce(ja.jobs_authorized,0) = 0) as no_authorized_jobs,
  coalesce(ja.off_jobs_with_errors,false)          as off_jobs_with_errors,
  coalesce(ja.problem_jobs,'[]'::jsonb)            as problem_jobs,
  nullif(trim(te.full_name),'')                    as technician,
  coalesce(r.estimated_completion_date, (ab.pickup_time)::timestamptz) as eta,
  coalesce(nullif(trim(m.clab->>'name'),''), nullif(trim(m.lab->>'name'),'')) as ro_label,
  ( (m.lab->>'code') in ('PNDAUTH','REQUIRESAUTH')
    or (m.clab->>'name') ilike any (array['%call customer%','%additional auth%']) ) as waiting_on_customer,
  (ab.appt_option = 'STAY')                        as customer_waiting
from active_ro r
left join public.tekmetric_vehicles v  on v.tekmetric_id = r.vehicle_id
left join public.tekmetric_employees e on e.tekmetric_id = r.service_writer_id
left join public.tekmetric_employees te on te.tekmetric_id = r.technician_id
left join cust cu on cu.tekmetric_id = r.customer_id
left join meta m  on m.tekmetric_id = r.tekmetric_id
left join appt_best ab on ab.tekmetric_id = r.tekmetric_id
left join jobagg ja on ja.repair_order_id = r.tekmetric_id;

create view public.sa_rollup
with (security_invoker = false) as
select
  service_advisor,
  service_writer_id,
  count(*) as active_ros,
  count(*) filter (where status='REPAIR_IN_PROGRESS') as wip_ros,
  count(*) filter (where status='COMPLETE')           as done_ros,
  count(*) filter (where status='ESTIMATE')           as est_ros,
  count(*) filter (where status in ('REPAIR_IN_PROGRESS','COMPLETE')
        and (missing_vin or missing_miles or missing_address or auth_job_without_tech
          or auth_job_without_labor or part_without_price or part_without_cost
          or part_without_qty)) as mandatory_issues,
  count(*) filter (where missing_vin or missing_miles or missing_address or auth_job_without_tech
        or auth_job_without_labor or part_without_price or part_without_cost
        or part_without_qty or no_authorized_jobs) as ros_with_issues,
  count(*) filter (where missing_vin)            as c_missing_vin,
  count(*) filter (where missing_miles)          as c_missing_miles,
  count(*) filter (where missing_address)        as c_missing_address,
  count(*) filter (where auth_job_without_tech)  as c_auth_no_tech,
  count(*) filter (where auth_job_without_labor) as c_auth_no_labor,
  count(*) filter (where part_without_price)     as c_part_no_price,
  count(*) filter (where part_without_cost)      as c_part_no_cost,
  count(*) filter (where part_without_qty)       as c_part_no_qty,
  count(*) filter (where no_authorized_jobs)     as c_no_estimate
from public.ro_audit
group by service_advisor, service_writer_id;

-- Carga por técnico (jobs autorizados en ROs WIP/Completed): horas asignadas,
-- completadas y pendientes (= capacidad), y # de ROs. SOLO técnicos ACTIVOS.
create view public.tech_board
with (security_invoker = false) as
with jb as (
  select j.technician_id, j.labor_hours, j.completed_date, j.repair_order_id
  from public.tekmetric_jobs j
  join public.tekmetric_repair_orders r on r.tekmetric_id = j.repair_order_id
  where j.deleted_at is null and coalesce(j.archived,false)=false and j.authorized
    and r.status in ('REPAIR_IN_PROGRESS','COMPLETE') and r.deleted_at is null
)
select
  jb.technician_id,
  e.full_name as technician,
  count(distinct jb.repair_order_id) as ros,
  round(coalesce(sum(jb.labor_hours),0),2)                                              as assigned_hrs,
  round(coalesce(sum(jb.labor_hours) filter (where jb.completed_date is not null),0),2) as complete_hrs,
  round(coalesce(sum(jb.labor_hours) filter (where jb.completed_date is null),0),2)     as incomplete_hrs
from jb
join public.tekmetric_employees e
  on e.tekmetric_id = jb.technician_id
 and e.is_active = true
 and nullif(trim(e.full_name),'') is not null
group by jb.technician_id, e.full_name;

grant select on public.ro_audit  to anon;
grant select on public.sa_rollup to anon;
grant select on public.tech_board to anon;
