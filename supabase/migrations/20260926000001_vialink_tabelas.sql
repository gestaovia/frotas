-- =====================================================================
-- Vialink Frota · 1/4 · Tabelas
-- Regra fundamental: a POSSE (custody) é a fonte de verdade de quem
-- responde pelo veículo. Checklists são evidências complementares.
-- Colunas seguem os campos do aplicativo (camelCase -> snake_case).
-- Campos novos do aplicativo que ainda não têm coluna ficam em "extra".
-- Chaves estrangeiras são DEFERRABLE para que uma movimentação completa
-- (checklist + posse + transferência) seja gravada numa só transação.
-- =====================================================================
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------- Cadastros ----------
create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  cc_id uuid references public.cost_centers(id) deferrable initially deferred,
  lat numeric, lng numeric,
  active boolean not null default true,
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnh text, cnh_cat text, cnh_exp timestamptz, phone text,
  active boolean not null default true,
  inactive_at timestamptz, inactive_reason text,
  telemetry jsonb,
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- perfil de acesso de cada login (auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  role text not null default 'condutor' check (role in ('admin','gestor','supervisor','condutor')),
  driver_id uuid unique references public.drivers(id) on delete set null deferrable initially deferred,
  active boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  brand text not null, model text not null, year numeric,
  fuel_type text not null,
  avg_km_l numeric,
  odometer numeric not null default 0 check (odometer >= 0),
  tracker boolean not null default false,
  seats numeric check (seats between 1 and 60),
  ownership text not null default 'propria' check (ownership in ('propria','locada')),
  rental jsonb,                         -- locadora, contrato, retirada, prazo, histórico de renovações
  docs jsonb,                           -- CRLV por exercício e parcelas de IPVA
  maintenance boolean not null default false,
  maintenance_since timestamptz, maintenance_note text,
  active boolean not null default true,
  traccar_id bigint unique,             -- id do dispositivo no Traccar
  traccar_unique_id text unique,        -- IMEI
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- QR Code: só um identificador aleatório, sem dado sensível
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  extra jsonb not null default '{}'
);
create unique index qr_one_active_per_vehicle on public.qr_codes(vehicle_id) where active;

-- ---------- Posse ----------
create table public.custody (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  driver_id uuid not null references public.drivers(id) deferrable initially deferred,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_km numeric not null,
  end_km numeric,
  receive_checklist_id uuid,            -- referência ao checklist (sem FK: relação circular)
  deliver_checklist_id uuid,
  segments jsonb not null default '[]', -- obra / centro de custo ao longo da posse [{at, projectId, ccId, purpose, by}]
  closed_reason text check (closed_reason in ('entrega','transferencia','forcada','manutencao')),
  transfer_id uuid,
  imported boolean not null default false,
  extra jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (end_km is null or end_km >= start_km),
  -- nunca dois condutores ao mesmo tempo no mesmo veículo
  constraint custody_no_overlap exclude using gist (
    vehicle_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&
  ) deferrable initially deferred
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  from_driver_id uuid references public.drivers(id) deferrable initially deferred,
  to_driver_id uuid references public.drivers(id) deferrable initially deferred,
  status text not null default 'solicitada' check (status in ('solicitada','aguardando_entrega','entrega_andamento','aguardando_recebimento','recebimento_andamento','concluida','cancelada')),
  requested_at timestamptz not null default now(),
  forced boolean not null default false,
  justification text,
  requested_by text,
  from_custody_id uuid references public.custody(id) deferrable initially deferred,
  to_custody_id uuid references public.custody(id) deferrable initially deferred,
  deliver_checklist_id uuid, receive_checklist_id uuid,
  events jsonb not null default '[]',
  extra jsonb not null default '{}',
  check (not forced or length(coalesce(justification,'')) >= 10)
);

-- ---------- Checklists e problemas ----------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('recebimento','entrega','devolucao','diario','manut_entrada','manut_saida','avaria')),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  driver_id uuid references public.drivers(id) deferrable initially deferred,
  user_id text,
  custody_id uuid references public.custody(id) deferrable initially deferred,
  at timestamptz not null default now(),
  km numeric,
  fuel_level text,
  items jsonb,                          -- {pneus:'ok', farois:'regular', ...}
  ok boolean,
  problem jsonb,
  avarias text, notes text,
  photos jsonb,                         -- {frontal:'sb:caminho/no/storage', ...}
  project_id uuid references public.projects(id) deferrable initially deferred,
  location jsonb,                       -- {lat, lng, source}
  late boolean not null default false,
  extra jsonb not null default '{}'
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  driver_id uuid references public.drivers(id) deferrable initially deferred,
  at timestamptz not null default now(),
  type text not null,
  description text,
  severity text not null check (severity in ('baixa','media','alta','critica')),
  can_run boolean not null default true,
  photo text,
  status text not null default 'aberta',
  source text,
  location jsonb,
  resolved_at timestamptz, resolved_by text, resolution text,
  extra jsonb not null default '{}'
);

-- ---------- Custos e manutenção ----------
create table public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  driver_id uuid references public.drivers(id) deferrable initially deferred,
  custody_id uuid references public.custody(id) deferrable initially deferred,
  project_id uuid references public.projects(id) deferrable initially deferred,
  at timestamptz not null default now(),
  km numeric,
  liters numeric not null check (liters > 0),
  total numeric not null check (total > 0),
  fuel_type text, station text,
  receipt text,
  location jsonb,
  extra jsonb not null default '{}'
);

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade deferrable initially deferred,
  item text not null,
  every_km numeric, every_days numeric,
  last_km numeric, last_date timestamptz,
  extra jsonb not null default '{}'
);

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  at timestamptz not null default now(),
  items jsonb not null default '[]',
  cost numeric, shop text, km numeric,
  type text default 'preventiva',
  extra jsonb not null default '{}'
);

create table public.tolls (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  at timestamptz not null,
  place text, value numeric not null, invoice text,
  manual jsonb,                         -- ajuste manual {driverId, projectId, reason, by, at}
  extra jsonb not null default '{}'
);

create table public.fines (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  at timestamptz not null,
  place text, infraction text, gravity text,
  value numeric, points numeric,
  notice text unique,
  attachments jsonb not null default '[]',
  manual_driver_id uuid references public.drivers(id) deferrable initially deferred,
  extra jsonb not null default '{}'
);

-- ---------- Rastreamento ----------
-- última posição conhecida por veículo (id = id do veículo)
create table public.vehicle_last_location (
  id uuid primary key references public.vehicles(id) on delete cascade deferrable initially deferred,
  lat numeric not null, lng numeric not null,
  speed numeric, ignition boolean, km numeric,
  at timestamptz not null,
  source text,
  extra jsonb not null default '{}'
);

-- histórico de posições recebidas do Traccar (gravado pelo servidor)
create table public.vehicle_positions (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  lat numeric not null, lng numeric not null,
  speed numeric, course numeric, ignition boolean, km numeric,
  address text,
  at timestamptz not null,
  traccar_position_id bigint unique
);

create table public.tracker_events (
  id uuid primary key default gen_random_uuid(),
  ext_id bigint unique,
  vehicle_id uuid not null references public.vehicles(id) deferrable initially deferred,
  driver_id uuid references public.drivers(id) deferrable initially deferred,
  type text not null,
  at timestamptz not null,
  speed numeric, lat numeric, lng numeric,
  extra jsonb not null default '{}'
);

-- ---------- Alertas, auditoria e regras ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  to_target text not null,              -- 'gestao', id do condutor ou id do usuário
  text text not null,
  at timestamptz not null default now(),
  read boolean not null default false,
  level text not null default 'info',
  link jsonb,
  extra jsonb not null default '{}'
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  type text not null,
  text text not null,
  vehicle_id uuid,
  driver_id uuid,
  user_id text,                         -- id do usuário ou 'sistema'
  data jsonb,
  extra jsonb not null default '{}'
);

-- regras da frota, métricas de premiação e opções de integração (uma linha)
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- Área privada (nunca exposta pela API) ----------
create table private.traccar_config (
  id int primary key default 1 check (id = 1),
  url text,
  token text,
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table private.bootstrap_admins (
  email text primary key
);

-- ---------- Índices das chaves mais consultadas ----------
create index on public.projects(cc_id);
create index on public.custody(vehicle_id, started_at desc);
create index on public.custody(driver_id, started_at desc);
create index on public.transfers(vehicle_id);
create index on public.transfers(from_driver_id);
create index on public.transfers(to_driver_id);
create index on public.transfers(from_custody_id);
create index on public.transfers(to_custody_id);
create index on public.checklists(vehicle_id, at desc);
create index on public.checklists(driver_id, at desc);
create index on public.checklists(custody_id);
create index on public.checklists(project_id);
create index on public.issues(vehicle_id);
create index on public.issues(driver_id);
create index on public.fuel_records(vehicle_id, at desc);
create index on public.fuel_records(driver_id);
create index on public.fuel_records(custody_id);
create index on public.fuel_records(project_id);
create index on public.maintenance_plans(vehicle_id);
create index on public.maintenance_records(vehicle_id);
create index on public.tolls(plate, at);
create index on public.fines(plate, at);
create index on public.fines(manual_driver_id);
create index on public.vehicle_positions(vehicle_id, at desc);
create index on public.tracker_events(vehicle_id, at desc);
create index on public.tracker_events(driver_id, at desc);
create index on public.notifications(to_target, at desc);
create index on public.audit_logs(vehicle_id, at desc);
create index on public.audit_logs(driver_id, at desc);
create index on public.audit_logs(at desc);
create index on public.qr_codes(vehicle_id);
