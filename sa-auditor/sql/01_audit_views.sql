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
-- Notas de datos (sincronizado de Tekmetric):
--   * tekmetric_customers.address es jsonb a veces doble-codificado (string).
--   * El RO NO trae appointmentId fiable; el waiter (appointmentOption STAY) y
--     la hora de entrega (pickupTime) se cruzan best-effort por vehículo+fecha
--     desde tekmetric_appointments (cobertura parcial hasta mejorar el sync).
--   * Los CTE (jobs, line_items, customers, appointments) se filtran a los ROs
--     activos ANTES de agregar/decodificar jsonb, para evitar timeouts (57014).
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
job_agg as (
  select j.repair_order_id,
    count(*) filter (where j.deleted_at is null) as jobs_total,
    count(*) filter (where j.deleted_at is null and j.authorized) as jobs_authorized,
    round(coalesce(sum(j.labor_hours) filter (where j.deleted_at is null and j.authorized),0),2) as labor_hours,
    bool_or(j.deleted_at is null and j.authorized and j.technician_id is null) as auth_job_without_tech,
    bool_or(j.deleted_at is null and j.authorized and coalesce(j.labor_hours,0)=0) as auth_job_without_labor,
    bool_or(j.deleted_at is null and j.authorized and coalesce(j.parts_sub_total,0)=0) as auth_job_without_parts
  from public.tekmetric_jobs j
  where j.repair_order_id in (select tekmetric_id from active_ro)
  group by j.repair_order_id
),
li_agg as (
  select li.repair_order_id,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.unit_price is null or li.unit_price=0)) as part_without_price,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.unit_cost is null or li.unit_cost=0)) as part_without_cost,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.quantity is null or li.quantity=0)) as part_without_qty
  from public.tekmetric_job_line_items li
  where li.repair_order_id in (select tekmetric_id from active_ro)
  group by li.repair_order_id
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
  where a.deleted_at is null
    and a.vehicle_id in (select vehicle_id from active_ro)
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
  coalesce(ja.auth_job_without_parts,false)        as auth_job_without_parts,
  coalesce(la.part_without_price,false)            as part_without_price,
  coalesce(la.part_without_cost,false)             as part_without_cost,
  coalesce(la.part_without_qty,false)              as part_without_qty,
  (coalesce(ja.jobs_total,0) > 0 and coalesce(ja.jobs_authorized,0) = 0) as no_authorized_jobs,
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
left join job_agg ja on ja.repair_order_id = r.tekmetric_id
left join li_agg la on la.repair_order_id = r.tekmetric_id;

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
-- completadas y pendientes (= capacidad), y # de ROs.
-- SOLO técnicos ACTIVOS (e.is_active): excluye ex-técnicos con jobs históricos.
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
