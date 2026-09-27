-- =====================================================================
-- Vialink Frota · 3/4 · Login, funções de apoio, regras padrão e arquivos
-- =====================================================================

-- ---------- novo login -> perfil de acesso ----------
-- Quem cria usuários é a função admin-users (servidor), que informa o perfil em
-- app_metadata (o usuário não consegue alterar app_metadata).
-- Cadastro espontâneo (sign up) nasce INATIVO e sem acesso a dados,
-- exceto os e-mails da lista private.bootstrap_admins (primeiro administrador).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  boot boolean := exists (select 1 from private.bootstrap_admins b where lower(b.email) = lower(new.email));
  r text;
begin
  r := case when boot then 'admin'
            when m->>'vialink_role' in ('admin','gestor','supervisor','condutor') then m->>'vialink_role'
            else 'condutor' end;
  insert into public.profiles (id, email, name, role, driver_id, active, must_change_password)
  values (new.id, lower(new.email),
          coalesce(nullif(m->>'vialink_name',''), nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
          r, nullif(m->>'vialink_driver_id','')::uuid,
          boot or (m ? 'vialink_role'),
          coalesce((m->>'vialink_must_change')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- primeiro administrador (quem criou o projeto). Outros entram pela tela de usuários.
insert into private.bootstrap_admins(email) values ('mauriciosantos@dgaautomacao.com.br') on conflict do nothing;

-- ---------- gravação em lote (uma transação por movimentação) ----------
-- SECURITY INVOKER: roda com o login de quem chamou, então TODAS as políticas RLS valem.
create or replace function public.sync_apply(ops jsonb)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb; t text; k text; r jsonb;
  cols text; sets text; upd text; n int; total int := 0;
  allowed constant text[] := array['cost_centers','projects','drivers','vehicles','qr_codes','custody','transfers',
    'checklists','issues','fuel_records','maintenance_plans','maintenance_records','tolls','fines',
    'vehicle_last_location','tracker_events','notifications','audit_logs','app_settings'];
begin
  if not private.is_active() then
    raise exception 'Seu acesso está inativo.' using errcode = '42501';
  end if;
  if jsonb_typeof(ops) is distinct from 'array' or jsonb_array_length(ops) > 1000 then
    raise exception 'Lote inválido.' using errcode = '22023';
  end if;
  set constraints all deferred;
  for op in select value from jsonb_array_elements(ops) loop
    t := op->>'t'; k := op->>'op'; r := op->'row';
    if t is null or not (t = any(allowed)) then
      raise exception 'Tabela não permitida: %', t using errcode = '42501';
    end if;
    if k = 'delete' then
      execute format('delete from public.%I where id::text = $1', t) using op->>'id';
      get diagnostics n = row_count;
      if n = 0 then raise exception 'Sem permissão para excluir (%).', t using errcode = '42501'; end if;
    elsif k in ('insert','upsert','update') then
      if jsonb_typeof(r) is distinct from 'object' or not (r ? 'id') then
        raise exception 'Registro sem id (%).', t using errcode = '22023';
      end if;
      select string_agg(quote_ident(a.attname), ',' order by a.attnum),
             string_agg(case when a.attname <> 'id' then format('%1$I = excluded.%1$I', a.attname) end, ',' order by a.attnum),
             string_agg(case when a.attname <> 'id' then format('%1$I = p.%1$I', a.attname) end, ',' order by a.attnum)
        into cols, sets, upd
        from pg_catalog.pg_attribute a
       where a.attrelid = format('public.%I', t)::regclass
         and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = ''
         and r ? a.attname;
      if k = 'insert' then
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t, cols, cols, t) using r;
      elsif k = 'upsert' then
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (id) do update set %s',
                       t, cols, cols, t, coalesce(sets, 'id = excluded.id')) using r;
      elsif upd is not null then
        execute format('update public.%I x set %s from jsonb_populate_record(null::public.%I, $1) p where x.id = p.id', t, upd, t) using r;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'Sem permissão para alterar (%).', t using errcode = '42501'; end if;
      end if;
    else
      raise exception 'Operação inválida: %', k using errcode = '22023';
    end if;
    total := total + 1;
  end loop;
  return total;
end $$;
revoke all on function public.sync_apply(jsonb) from public, anon;
grant execute on function public.sync_apply(jsonb) to authenticated;

-- ---------- lista de nomes dos condutores (sem CNH e telefone) ----------
create or replace function public.driver_directory()
returns table (id uuid, name text, active boolean)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.active from public.drivers d where private.is_active() order by d.name
$$;
revoke all on function public.driver_directory() from public, anon;
grant execute on function public.driver_directory() to authenticated;

-- ---------- troca de senha obrigatória no primeiro acesso ----------
create or replace function public.password_changed()
returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = (select auth.uid())
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- ---------- quem estava com o veículo num horário (pedágio, multa, rastreador) ----------
create or replace function public.custody_at(p_vehicle uuid, p_at timestamptz)
returns table (custody_id uuid, driver_id uuid)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.driver_id from public.custody c
   where c.vehicle_id = p_vehicle and c.started_at <= p_at and (c.ended_at is null or p_at < c.ended_at)
   limit 1
$$;
revoke all on function public.custody_at(uuid, timestamptz) from public, anon;
grant execute on function public.custody_at(uuid, timestamptz) to authenticated, service_role;

-- ---------- Traccar: token só no servidor ----------
-- O administrador informa endereço e token; o token é gravado no schema privado
-- e NUNCA volta para o navegador. Só a função traccar-proxy (servidor) o lê.
create or replace function public.traccar_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c private.traccar_config;
begin
  if not private.is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into c from private.traccar_config where id = 1;
  return jsonb_build_object(
    'url', c.url,
    'hasToken', c.token is not null and c.token <> '',
    'updatedAt', c.updated_at,
    'webhookSecret', case when private.is_admin() then c.webhook_secret end);
end $$;
revoke all on function public.traccar_status() from public, anon;
grant execute on function public.traccar_status() to authenticated;

create or replace function public.set_traccar_config(p_url text, p_token text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Somente o administrador configura o rastreamento.' using errcode = '42501'; end if;
  if p_url is not null and p_url <> '' and p_url !~ '^https?://' then raise exception 'Endereço inválido.' using errcode = '22023'; end if;
  insert into private.traccar_config (id, url, token, updated_at, updated_by)
  values (1, nullif(p_url,''), nullif(p_token,''), now(), (select auth.uid()))
  on conflict (id) do update
    set url = excluded.url,
        token = coalesce(nullif(p_token,''), private.traccar_config.token),
        updated_at = now(), updated_by = excluded.updated_by;
  return public.traccar_status();
end $$;
revoke all on function public.set_traccar_config(text, text) from public, anon;
grant execute on function public.set_traccar_config(text, text) to authenticated;

-- leitura interna do token: somente a chave de serviço (funções do servidor)
create or replace function public.traccar_config_internal()
returns table (url text, token text, webhook_secret text)
language sql stable security definer set search_path = '' as $$
  select c.url, c.token, c.webhook_secret from private.traccar_config c where c.id = 1
$$;
revoke all on function public.traccar_config_internal() from public, anon, authenticated;
grant execute on function public.traccar_config_internal() to service_role;

insert into private.traccar_config (id) values (1) on conflict do nothing;

-- ---------- regras padrão da frota ----------
insert into public.app_settings (id, data) values (1, '{
  "dailyDeadline": "10:00", "transferAlertHours": 4, "oneVehiclePerDriver": true, "requirePhotos": true,
  "maint": {"attentionKm": 1500, "urgentKm": 500, "attentionDays": 30, "urgentDays": 7},
  "fuelDeviationPct": 15,
  "score": {
    "criteria": {"checklist": {"on": true, "weight": 30}, "conservacao": {"on": true, "weight": 20}, "abastecimento": {"on": true, "weight": 15},
                 "infracoes": {"on": true, "weight": 20}, "procedimentos": {"on": true, "weight": 15}},
    "penalties": {"atraso": 50, "avaria": 5, "limpeza": 2, "leve": 3, "media": 5, "grave": 8, "gravissima": 12, "forcada": 5, "semObra": 5, "telemetria": 2},
    "mode": "faixas", "minScore": 70, "maxBonus": 300,
    "tiers": [{"min": 90, "value": 300}, {"min": 80, "value": 200}, {"min": 70, "value": 100}]
  },
  "rental": {"warnDays": 30, "urgentDays": 7},
  "tracker": {"enabled": true, "provider": "Traccar", "endpoint": "", "interval": 60},
  "traccar": {"mode": "off", "url": "", "live": false, "pollSec": 30, "odometer": true, "speedLimit": 100},
  "docs": {"warnDays": 30, "urgentDays": 7}
}'::jsonb) on conflict (id) do nothing;

-- ---------- arquivos (fotos de checklist, cupons, CRLV, comprovantes) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vialink-arquivos', 'vialink-arquivos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

create policy "vialink: ativos enviam arquivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'vialink-arquivos' and (select private.is_active()));
create policy "vialink: equipe ou autor le arquivos" on storage.objects for select to authenticated
  using (bucket_id = 'vialink-arquivos' and ((select private.is_staff()) or owner_id = (select auth.uid())::text));
create policy "vialink: gestao remove arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'vialink-arquivos' and (select private.is_manager()));
