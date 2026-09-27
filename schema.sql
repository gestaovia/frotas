-- =====================================================================
-- Vialink Frota — estrutura do banco (PostgreSQL / Supabase)
-- Regra fundamental: a POSSE (vehicle_custody) é a fonte de verdade de
-- quem responde pelo veículo. Checklists são evidências complementares.
-- =====================================================================
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type user_role        as enum ('admin','gestor','supervisor','condutor');
create type transfer_status  as enum ('solicitada','aguardando_entrega','entrega_andamento','aguardando_recebimento','recebimento_andamento','concluida','cancelada');
create type checklist_type   as enum ('recebimento','entrega','devolucao','diario','manut_entrada','manut_saida','avaria');
create type item_result      as enum ('ok','regular','ruim');
create type issue_severity   as enum ('baixa','media','alta','critica');
create type custody_close    as enum ('entrega','transferencia','forcada','manutencao');

-- ---------- Cadastros ----------
create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- "Obra 15"
  name text not null,
  cost_center_id uuid not null references cost_centers(id),
  latitude numeric(9,6), longitude numeric(9,6),
  active boolean not null default true
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'condutor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id),
  name text not null,
  cnh_number text, cnh_category text, cnh_expires_on date,
  phone text,
  active boolean not null default true
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  brand text not null, model text not null, year int,
  fuel_type text not null,
  odometer_km int not null default 0,
  reference_km_per_l numeric(5,2),
  has_tracker boolean not null default false,
  ownership text not null default 'propria' check (ownership in ('propria','locada')),
  seats int check (seats between 1 and 60),              -- quantidade de ocupantes
  in_maintenance boolean not null default false,
  maintenance_since timestamptz, maintenance_note text,
  active boolean not null default true
);

-- Contratos de veículos locados (prazo de devolução ou renovação)
create table vehicle_rentals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  company text not null, contract_number text,
  pickup_date date not null,
  due_date date not null check (due_date > pickup_date),
  monthly_value numeric(10,2),
  status text not null default 'ativa' check (status in ('ativa','renovada','devolvida')),
  returned_at timestamptz,
  renewed_from uuid references vehicle_rentals(id)   -- cada renovação gera um registro novo
);
create unique index one_active_rental_per_vehicle on vehicle_rentals(vehicle_id) where status = 'ativa';

-- QR Code: só um identificador aleatório. Nenhum dado sensível no código.
create table vehicle_qr_codes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  token text not null unique,                -- ex.: VLK1-7F3K9QX2M4TBP8WZ
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index one_active_qr_per_vehicle on vehicle_qr_codes(vehicle_id) where active;

-- ---------- Posse ----------
create table vehicle_custody (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references drivers(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_km int not null,
  end_km int,
  receive_checklist_id uuid,
  deliver_checklist_id uuid,
  closed_reason custody_close,
  transfer_id uuid,
  check (ended_at is null or ended_at > started_at),
  check (end_km is null or end_km >= start_km),
  -- nunca dois condutores ao mesmo tempo no mesmo veículo
  exclude using gist (vehicle_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity')) with &&)
);
create unique index one_open_custody_per_vehicle on vehicle_custody(vehicle_id) where ended_at is null;

-- obra / centro de custo ao longo da posse (troca sem encerrar a posse)
create table custody_project_changes (
  id uuid primary key default gen_random_uuid(),
  custody_id uuid not null references vehicle_custody(id) on delete cascade,
  project_id uuid not null references projects(id),
  cost_center_id uuid not null references cost_centers(id),
  purpose text,
  changed_at timestamptz not null default now(),
  changed_by uuid references users(id)
);

create table vehicle_transfers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  from_driver_id uuid references drivers(id),
  to_driver_id uuid references drivers(id),
  status transfer_status not null default 'solicitada',
  forced boolean not null default false,
  justification text,
  check (not forced or length(coalesce(justification,'')) >= 15),
  requested_by uuid references users(id),
  requested_at timestamptz not null default now(),
  from_custody_id uuid references vehicle_custody(id),
  to_custody_id uuid references vehicle_custody(id),
  deliver_checklist_id uuid, receive_checklist_id uuid,
  events jsonb not null default '[]'        -- [{at,status,by,note}]
);
create unique index one_open_transfer_per_vehicle on vehicle_transfers(vehicle_id) where status not in ('concluida','cancelada');

-- ---------- Checklists ----------
create table checklists (
  id uuid primary key default gen_random_uuid(),
  type checklist_type not null,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid references drivers(id),
  user_id uuid references users(id),
  custody_id uuid references vehicle_custody(id),
  performed_at timestamptz not null default now(),
  odometer_km int not null,
  fuel_level text,
  is_regular boolean not null,               -- diário: "condições normais?"
  damages text, notes text,
  late boolean not null default false,
  latitude numeric(9,6), longitude numeric(9,6), location_source text
);
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  item text not null,                        -- pneus, farois, vidros, retrovisores, lataria, limpeza, estepe, ferramentas, documentacao
  result item_result not null
);
create table checklist_photos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  slot text not null,                        -- frontal, traseira, lat_dir, lat_esq, painel
  storage_path text not null,                -- bucket do Supabase Storage
  taken_at timestamptz not null default now()
);

create table vehicle_issues (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid references drivers(id),
  checklist_id uuid references checklists(id),
  reported_at timestamptz not null default now(),
  type text not null, description text not null,
  severity issue_severity not null,
  can_run boolean not null,                  -- false = veículo bloqueado
  photo_path text,
  status text not null default 'aberta',
  resolved_at timestamptz, resolved_by uuid references users(id), resolution text
);

-- ---------- Custos operacionais ----------
create table fuel_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references drivers(id),
  custody_id uuid not null references vehicle_custody(id),
  project_id uuid references projects(id),
  filled_at timestamptz not null default now(),
  odometer_km int not null,
  liters numeric(8,2) not null check (liters > 0),
  total_value numeric(10,2) not null check (total_value > 0),
  fuel_type text not null, station text not null,
  receipt_path text not null
);

create table maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  item text not null,                        -- troca de óleo, filtros, alinhamento...
  every_km int, every_days int,
  last_km int, last_date date,
  check (every_km is not null or every_days is not null)
);
create table maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  performed_at timestamptz not null default now(),
  items text[] not null, shop text,
  odometer_km int, cost numeric(10,2)
);

create table tolls (
  id uuid primary key default gen_random_uuid(),
  plate text not null, passed_at timestamptz not null,
  place text not null, value numeric(8,2) not null,
  invoice text,
  manual_driver_id uuid references drivers(id),
  manual_project_id uuid references projects(id),
  manual_reason text, adjusted_by uuid references users(id), adjusted_at timestamptz
);
create table fines (
  id uuid primary key default gen_random_uuid(),
  plate text not null, occurred_at timestamptz not null,
  place text not null, infraction text not null, gravity text not null,
  value numeric(8,2) not null, points int,
  notice_number text not null unique,
  attachments text[] not null default '{}',
  manual_driver_id uuid references drivers(id)
);

-- ---------- Rastreador ----------
create table vehicle_locations (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references vehicles(id),
  latitude numeric(9,6) not null, longitude numeric(9,6) not null,
  speed_kmh numeric(5,1), ignition boolean, odometer_km int,
  status text, recorded_at timestamptz not null
);
create index on vehicle_locations(vehicle_id, recorded_at desc);

-- ---------- Condutor ----------
-- Métricas de premiação definidas pelo gestor (uma linha vigente por organização)
create table score_settings (
  id uuid primary key default gen_random_uuid(),
  criteria jsonb not null,     -- {"checklist":{"on":true,"weight":30}, ...}  soma dos ativos = 100
  penalties jsonb not null,    -- {"atraso":50,"avaria":5,"leve":3,"media":5,"grave":8,"gravissima":12,...}
  mode text not null check (mode in ('faixas','proporcional')),
  tiers jsonb not null default '[]',   -- [{"min":90,"value":300},{"min":80,"value":200}]
  min_score numeric(5,2), max_bonus numeric(10,2),
  valid_from date not null default current_date,
  updated_by uuid references users(id)
);

create table driver_scores (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  month date not null,
  checklist_pts numeric(5,2), conservation_pts numeric(5,2), fuel_pts numeric(5,2),
  infractions_pts numeric(5,2), procedures_pts numeric(5,2), total numeric(5,2),
  details jsonb,
  unique (driver_id, month)
);
create table driver_bonuses (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  month date not null, score numeric(5,2), value numeric(10,2),
  approved_by uuid references users(id), approved_at timestamptz,
  unique (driver_id, month)
);

-- ---------- Alertas e auditoria ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid references users(id),
  to_role user_role,
  text text not null, level text not null default 'info',
  link jsonb, read_at timestamptz,
  created_at timestamptz not null default now()
);
create table audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  type text not null, text text not null,
  vehicle_id uuid references vehicles(id),
  driver_id uuid references drivers(id),
  user_id uuid references users(id),
  data jsonb
);
create index on audit_logs(vehicle_id, at desc);
create index on audit_logs(driver_id, at desc);

-- ---------- Cruzamento automático: quem estava com o veículo em um horário ----------
create or replace function custody_at(p_plate text, p_at timestamptz)
returns table (custody_id uuid, driver_id uuid, project_id uuid, cost_center_id uuid)
language sql stable as $$
  select c.id, c.driver_id, pc.project_id, pc.cost_center_id
  from vehicles v
  join vehicle_custody c on c.vehicle_id = v.id
   and c.started_at <= p_at and (c.ended_at is null or p_at < c.ended_at)
  left join lateral (
    select project_id, cost_center_id from custody_project_changes
    where custody_id = c.id and changed_at <= p_at
    order by changed_at desc limit 1
  ) pc on true
  where v.plate = upper(p_plate);
$$;
-- Uso: select * from custody_at('ABC1D23', '2026-09-24 09:15-03');

-- Próximos passos na implantação: políticas RLS por perfil (condutor vê só a própria
-- posse), bucket de fotos no Storage, e funções que abrem/fecham posse de forma atômica.
-- ============ Vialink Frota · integração Traccar ============
-- Rode depois do schema.sql principal.
alter table vehicles
  add column if not exists traccar_device_id bigint unique,      -- id do dispositivo no Traccar
  add column if not exists traccar_unique_id text unique;        -- IMEI / identificador do rastreador

alter table vehicle_locations
  add column if not exists course numeric(5,1),
  add column if not exists address text,
  add column if not exists source text not null default 'traccar',   -- traccar | checklist
  add column if not exists traccar_position_id bigint unique;

-- Alertas de condução vindos do rastreador (usados na premiação e nos alertas do painel)
create table if not exists telemetry_events (
  id uuid primary key default gen_random_uuid(),
  traccar_event_id bigint unique,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid references drivers(id),          -- condutor com a posse no horário (custody_at)
  custody_id uuid references vehicle_custody(id),
  type text not null check (type in ('overspeed','hardBraking','hardAcceleration','hardCornering','sos','powerCut','tampering')),
  occurred_at timestamptz not null,
  speed_kmh numeric(5,1),
  latitude numeric(9,6), longitude numeric(9,6)
);
create index if not exists telemetry_events_driver_idx on telemetry_events(driver_id, occurred_at desc);
create index if not exists telemetry_events_vehicle_idx on telemetry_events(vehicle_id, occurred_at desc);

-- ============ Documentação do veículo: CRLV e IPVA ============
create table if not exists vehicle_registrations (      -- CRLV por exercício
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  exercise_year int not null,
  renavam text check (renavam ~ '^[0-9]{9,11}$'),
  issued_at date,
  next_licensing_due date not null,                      -- lembrete de renovação
  licensing_fee numeric(10,2), licensing_paid_at date,
  file_path text,                                        -- CRLV-e no Supabase Storage
  created_by uuid references users(id),
  unique (vehicle_id, exercise_year)
);
alter table vehicles add column if not exists ipva_by_rental boolean not null default false;
create table if not exists ipva_installments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  exercise_year int not null,
  installment int not null,             -- 1 = cota única ou 1ª parcela
  installments_total int not null,
  due_date date not null,
  amount numeric(10,2) not null,
  paid_at date, paid_amount numeric(10,2),
  receipt_path text,
  paid_by uuid references users(id),
  unique (vehicle_id, exercise_year, installment)
);
create index if not exists ipva_open_idx on ipva_installments(due_date) where paid_at is null;
