-- =====================================================================
-- Vialink Frota · 2/4 · Perfis de acesso e RLS
--   admin      : tudo, inclusive usuários e integrações
--   gestor     : opera a frota inteira (cadastros, transferência forçada,
--                pedágios, multas, manutenção, premiação)
--   supervisor : acompanha tudo, sem ações administrativas
--   condutor   : só o que é dele (posse, checklists, abastecimentos,
--                transferências e alertas próprios)
-- Visitante (anon) não lê nada. Perfil inativo não lê nada.
-- =====================================================================

-- ---------- funções de apoio (schema privado, não expostas pela API) ----------
create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('admin','gestor','supervisor'), false)
$$;
create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('admin','gestor'), false)
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false)
$$;
create or replace function private.my_driver_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.driver_id from public.profiles p where p.id = (select auth.uid()) and p.active
$$;
-- o condutor está (ou acabou de estar) com o veículo: posse aberta ou encerrada há menos de 2 h
create or replace function private.has_vehicle(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.custody c
    where c.vehicle_id = p_vehicle and c.driver_id = private.my_driver_id()
      and (c.ended_at is null or c.ended_at > now() - interval '2 hours'))
$$;
-- a multa caiu num período de posse do condutor
create or replace function private.fine_is_mine(p_plate text, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.custody c join public.vehicles v on v.id = c.vehicle_id
    where v.plate = p_plate and c.driver_id = private.my_driver_id()
      and c.started_at <= p_at and (c.ended_at is null or p_at < c.ended_at))
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------- RLS ligado em todas as tabelas ----------
alter table public.cost_centers          enable row level security;
alter table public.projects              enable row level security;
alter table public.drivers               enable row level security;
alter table public.profiles              enable row level security;
alter table public.vehicles              enable row level security;
alter table public.qr_codes              enable row level security;
alter table public.custody               enable row level security;
alter table public.transfers             enable row level security;
alter table public.checklists            enable row level security;
alter table public.issues                enable row level security;
alter table public.fuel_records          enable row level security;
alter table public.maintenance_plans     enable row level security;
alter table public.maintenance_records   enable row level security;
alter table public.tolls                 enable row level security;
alter table public.fines                 enable row level security;
alter table public.vehicle_last_location enable row level security;
alter table public.vehicle_positions     enable row level security;
alter table public.tracker_events        enable row level security;
alter table public.notifications         enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.app_settings          enable row level security;
alter table private.traccar_config       enable row level security;
alter table private.bootstrap_admins     enable row level security;

-- visitante sem login não acessa nenhuma tabela
revoke all on all tables in schema public from anon;
revoke all on all tables in schema private from anon, authenticated;

-- ---------- cadastros lidos por todos os usuários ativos, alterados pela gestão ----------
create policy "ativos leem" on public.cost_centers for select to authenticated using ((select private.is_active()));
create policy "gestao grava" on public.cost_centers for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.cost_centers for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "admin exclui" on public.cost_centers for delete to authenticated using ((select private.is_admin()));

create policy "ativos leem" on public.projects for select to authenticated using ((select private.is_active()));
create policy "gestao grava" on public.projects for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.projects for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "admin exclui" on public.projects for delete to authenticated using ((select private.is_admin()));

create policy "ativos leem" on public.qr_codes for select to authenticated using ((select private.is_active()));
create policy "gestao grava" on public.qr_codes for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.qr_codes for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "admin exclui" on public.qr_codes for delete to authenticated using ((select private.is_admin()));

create policy "ativos leem" on public.maintenance_plans for select to authenticated using ((select private.is_active()));
create policy "gestao grava" on public.maintenance_plans for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.maintenance_plans for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao exclui" on public.maintenance_plans for delete to authenticated using ((select private.is_manager()));

create policy "ativos leem" on public.app_settings for select to authenticated using ((select private.is_active()));
create policy "gestao altera" on public.app_settings for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao grava" on public.app_settings for insert to authenticated with check ((select private.is_manager()));

-- veículos: todos os ativos leem (o condutor escaneia qualquer QR);
-- a gestão altera tudo; o condutor só atualiza o hodômetro do veículo que está com ele (ver gatilho)
create policy "ativos leem" on public.vehicles for select to authenticated using ((select private.is_active()));
create policy "gestao grava" on public.vehicles for insert to authenticated with check ((select private.is_manager()));
create policy "gestao ou condutor com o veiculo altera" on public.vehicles for update to authenticated
  using ((select private.is_manager()) or private.has_vehicle(id))
  with check ((select private.is_manager()) or private.has_vehicle(id));
create policy "admin exclui" on public.vehicles for delete to authenticated using ((select private.is_admin()));

-- ---------- pessoas ----------
-- condutor vê só o próprio cadastro (CNH e telefone dos colegas ficam protegidos)
create policy "equipe ou o proprio le" on public.drivers for select to authenticated
  using ((select private.is_staff()) or id = (select private.my_driver_id()));
create policy "gestao grava" on public.drivers for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.drivers for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "admin exclui" on public.drivers for delete to authenticated using ((select private.is_admin()));

-- perfis: leitura do próprio perfil (mesmo inativo, para a tela avisar) e da equipe;
-- criação e alteração só pelo servidor (função admin-users com a chave de serviço)
create policy "proprio ou equipe le" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

-- ---------- posse ----------
create policy "equipe, o proprio ou posse aberta" on public.custody for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()) or (ended_at is null and (select private.is_active())));
create policy "gestao ou o proprio abre" on public.custody for insert to authenticated
  with check ((select private.is_manager()) or driver_id = (select private.my_driver_id()));
create policy "gestao ou o proprio altera" on public.custody for update to authenticated
  using ((select private.is_manager()) or driver_id = (select private.my_driver_id()))
  with check ((select private.is_manager()) or driver_id = (select private.my_driver_id()));
create policy "admin exclui" on public.custody for delete to authenticated using ((select private.is_admin()));

create policy "equipe ou envolvidos leem" on public.transfers for select to authenticated
  using ((select private.is_staff()) or from_driver_id = (select private.my_driver_id()) or to_driver_id = (select private.my_driver_id()));
create policy "gestao ou envolvidos criam" on public.transfers for insert to authenticated
  with check ((select private.is_manager()) or (not forced and (from_driver_id = (select private.my_driver_id()) or to_driver_id = (select private.my_driver_id()))));
create policy "gestao ou envolvidos alteram" on public.transfers for update to authenticated
  using ((select private.is_manager()) or from_driver_id = (select private.my_driver_id()) or to_driver_id = (select private.my_driver_id()))
  with check ((select private.is_manager()) or from_driver_id = (select private.my_driver_id()) or to_driver_id = (select private.my_driver_id()));
create policy "admin exclui" on public.transfers for delete to authenticated using ((select private.is_admin()));

-- ---------- checklists, problemas e abastecimentos ----------
create policy "equipe ou o proprio le" on public.checklists for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()));
create policy "gestao ou o proprio registra" on public.checklists for insert to authenticated
  with check ((select private.is_manager()) or (driver_id = (select private.my_driver_id()) and user_id = (select auth.uid())::text));
create policy "gestao ou o proprio altera" on public.checklists for update to authenticated
  using ((select private.is_manager()) or driver_id = (select private.my_driver_id()))
  with check ((select private.is_manager()) or driver_id = (select private.my_driver_id()));
create policy "admin exclui" on public.checklists for delete to authenticated using ((select private.is_admin()));

-- problemas em aberto ficam visíveis a todos (um veículo bloqueado não pode ser recebido)
create policy "equipe, o proprio ou em aberto" on public.issues for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()) or (status = 'aberta' and (select private.is_active())));
create policy "gestao ou o proprio registra" on public.issues for insert to authenticated
  with check ((select private.is_manager()) or driver_id = (select private.my_driver_id()));
create policy "gestao resolve" on public.issues for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "admin exclui" on public.issues for delete to authenticated using ((select private.is_admin()));

create policy "equipe ou o proprio le" on public.fuel_records for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()));
create policy "gestao ou o proprio registra" on public.fuel_records for insert to authenticated
  with check ((select private.is_manager()) or driver_id = (select private.my_driver_id()));
create policy "gestao altera" on public.fuel_records for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao exclui" on public.fuel_records for delete to authenticated using ((select private.is_manager()));

-- ---------- manutenção, pedágios e multas (gestão) ----------
create policy "equipe le" on public.maintenance_records for select to authenticated using ((select private.is_staff()));
create policy "gestao grava" on public.maintenance_records for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.maintenance_records for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao exclui" on public.maintenance_records for delete to authenticated using ((select private.is_manager()));

create policy "equipe le" on public.tolls for select to authenticated using ((select private.is_staff()));
create policy "gestao grava" on public.tolls for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.tolls for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao exclui" on public.tolls for delete to authenticated using ((select private.is_manager()));

-- o condutor vê as multas que caíram na posse dele (entram na pontuação)
create policy "equipe ou multa na posse do condutor" on public.fines for select to authenticated
  using ((select private.is_staff()) or manual_driver_id = (select private.my_driver_id()) or private.fine_is_mine(plate, at));
create policy "gestao grava" on public.fines for insert to authenticated with check ((select private.is_manager()));
create policy "gestao altera" on public.fines for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "gestao exclui" on public.fines for delete to authenticated using ((select private.is_manager()));

-- ---------- rastreamento ----------
create policy "ativos leem" on public.vehicle_last_location for select to authenticated using ((select private.is_active()));
create policy "equipe ou condutor com o veiculo grava" on public.vehicle_last_location for insert to authenticated
  with check ((select private.is_staff()) or private.has_vehicle(id));
create policy "equipe ou condutor com o veiculo altera" on public.vehicle_last_location for update to authenticated
  using ((select private.is_staff()) or private.has_vehicle(id))
  with check ((select private.is_staff()) or private.has_vehicle(id));

create policy "equipe le" on public.vehicle_positions for select to authenticated using ((select private.is_staff()));

create policy "equipe ou o proprio le" on public.tracker_events for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()));
create policy "equipe grava" on public.tracker_events for insert to authenticated with check ((select private.is_staff()));

-- ---------- alertas e auditoria ----------
create policy "destinatario le" on public.notifications for select to authenticated
  using (to_target = (select auth.uid())::text or to_target = (select private.my_driver_id())::text or (to_target = 'gestao' and (select private.is_staff())));
create policy "ativos enviam" on public.notifications for insert to authenticated with check ((select private.is_active()));
create policy "destinatario marca como lida" on public.notifications for update to authenticated
  using (to_target = (select auth.uid())::text or to_target = (select private.my_driver_id())::text or (to_target = 'gestao' and (select private.is_staff())))
  with check (to_target = (select auth.uid())::text or to_target = (select private.my_driver_id())::text or (to_target = 'gestao' and (select private.is_staff())));

-- auditoria: só inclusão, nunca alteração ou exclusão
create policy "equipe ou o proprio le" on public.audit_logs for select to authenticated
  using ((select private.is_staff()) or driver_id = (select private.my_driver_id()) or user_id = (select auth.uid())::text);
create policy "ativos registram em seu nome" on public.audit_logs for insert to authenticated
  with check ((select private.is_active()) and (user_id = (select auth.uid())::text or (user_id = 'sistema' and (select private.is_staff()))));

-- ---------- gatilhos de proteção (o que o RLS sozinho não restringe por coluna) ----------
create or replace function private.guard_vehicle_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_manager() or (select auth.role()) = 'service_role' or (select auth.uid()) is null then return new; end if;
  -- condutor: somente o hodômetro, e somente para cima
  if (to_jsonb(new) - 'odometer') is distinct from (to_jsonb(old) - 'odometer') then
    raise exception 'Condutor só pode atualizar a quilometragem do veículo.' using errcode = '42501';
  end if;
  if new.odometer < old.odometer then
    raise exception 'A quilometragem não pode diminuir.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_vehicle_update before update on public.vehicles for each row execute function private.guard_vehicle_update();

create or replace function private.guard_custody_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_manager() or (select auth.role()) = 'service_role' or (select auth.uid()) is null then return new; end if;
  if new.vehicle_id <> old.vehicle_id or new.driver_id <> old.driver_id or new.started_at <> old.started_at or new.start_km <> old.start_km then
    raise exception 'Dados de início da posse não podem ser alterados.' using errcode = '42501';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'Posse encerrada não pode ser reaberta.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_custody_update before update on public.custody for each row execute function private.guard_custody_update();

create or replace function private.guard_transfer_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_manager() or (select auth.role()) = 'service_role' or (select auth.uid()) is null then return new; end if;
  if new.vehicle_id <> old.vehicle_id or new.from_driver_id is distinct from old.from_driver_id
     or new.to_driver_id is distinct from old.to_driver_id or new.forced <> old.forced then
    raise exception 'Somente a gestão altera condutores ou força uma transferência.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_transfer_update before update on public.transfers for each row execute function private.guard_transfer_update();

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger touch_profiles before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_settings before update on public.app_settings for each row execute function private.touch_updated_at();
