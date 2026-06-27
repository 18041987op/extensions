-- ============================================================
-- SA Auditor — vistas de auditoría (solo lectura)
-- Aplicadas en el proyecto Supabase "tekmetric-integration C" (kiziudyqjnihywbmgsqn).
-- security_invoker=false: la vista corre como su dueño y agrega datos,
-- exponiendo SOLO lo necesario para auditar (sin nombre/teléfono/VIN del cliente).
--
-- Estados incluidos (las 3 columnas del tablero de Tekmetric):
--   ESTIMATE            -> Estimates       (baja prioridad)
--   REPAIR_IN_PROGRESS  -> Work In Progress (obligatorio: todo completo)
--   COMPLETE            -> Completed        (obligatorio: todo completo)
--
-- Para deshacer:  drop view public.sa_rollup; drop view public.ro_audit;
-- ============================================================

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
    bool_or(j.deleted_at is null and j.authorized and j.technician_id is null) as auth_job_without_tech,
    bool_or(j.deleted_at is null and j.authorized and coalesce(j.labor_hours,0)=0) as auth_job_without_labor,
    bool_or(j.deleted_at is null and j.authorized and coalesce(j.parts_sub_total,0)=0) as auth_job_without_parts
  from public.tekmetric_jobs j
  group by j.repair_order_id
),
li_agg as (
  select li.repair_order_id,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.unit_price is null or li.unit_price=0)) as part_without_price,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.unit_cost is null or li.unit_cost=0)) as part_without_cost,
    bool_or(li.deleted_at is null and li.line_type ilike '%part%' and (li.quantity is null or li.quantity=0)) as part_without_qty
  from public.tekmetric_job_line_items li
  group by li.repair_order_id
),
-- La dirección del cliente viene como jsonb que a veces guarda un JSON *string*
-- (doble-codificado). Se normaliza para poder leer address1/fullAddress.
cust as (
  select c.tekmetric_id,
    case when jsonb_typeof(c.address)='string' then (c.address #>> '{}')::jsonb else c.address end as addr
  from public.tekmetric_customers c
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
  coalesce(ja.auth_job_without_tech,false)         as auth_job_without_tech,
  coalesce(ja.auth_job_without_labor,false)        as auth_job_without_labor,
  coalesce(ja.auth_job_without_parts,false)        as auth_job_without_parts,
  coalesce(la.part_without_price,false)            as part_without_price,
  coalesce(la.part_without_cost,false)             as part_without_cost,
  coalesce(la.part_without_qty,false)              as part_without_qty,
  (coalesce(ja.jobs_total,0) > 0 and coalesce(ja.jobs_authorized,0) = 0) as no_authorized_jobs
from active_ro r
left join public.tekmetric_vehicles v  on v.tekmetric_id = r.vehicle_id
left join public.tekmetric_employees e on e.tekmetric_id = r.service_writer_id
left join cust cu on cu.tekmetric_id = r.customer_id
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
  -- "obligatorios": ROs en WIP/Completed con algo faltante (los que el SA debe cerrar)
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

grant select on public.ro_audit to anon;
grant select on public.sa_rollup to anon;
