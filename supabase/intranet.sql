-- ─────────────────────────────────────────────────────────────
-- IMOBU — Intranet de parámetros (Supabase / PostgreSQL)
-- Ejecutar una vez en el SQL Editor del proyecto (o como migración).
--
-- Seguridad:
--  · Lectura pública solo de los parámetros publicados (el sitio los necesita).
--  · Escritura SOLO para usuarios autenticados que estén en imobu_admins y con correo confirmado.
--  · Cada cambio queda registrado en el historial (quién y cuándo).
--  · La lista de administradores no es accesible desde la API.
-- ─────────────────────────────────────────────────────────────

-- 1. Administradores (se agregan por SQL; nadie puede auto-agregarse)
create table if not exists public.imobu_admins (
  email   text primary key check (email = lower(email) and email like '%@%'),
  creado  timestamptz not null default now()
);
alter table public.imobu_admins enable row level security;
-- Sin políticas: la tabla no se puede leer ni modificar desde la API.
revoke all on public.imobu_admins from anon, authenticated;

-- ¿El usuario de la sesión es administrador? (correo confirmado + en la lista)
create or replace function public.imobu_es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.imobu_admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.imobu_es_admin() from public, anon;
grant execute on function public.imobu_es_admin() to authenticated;

-- 2. Parámetros publicados (una sola fila)
create table if not exists public.imobu_config (
  id              smallint primary key default 1 check (id = 1),
  data            jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  actualizado     timestamptz not null default now(),
  actualizado_por text
);
alter table public.imobu_config enable row level security;

drop policy if exists "imobu_config lectura publica" on public.imobu_config;
create policy "imobu_config lectura publica" on public.imobu_config
  for select to anon, authenticated using (true);

drop policy if exists "imobu_config admins insertan" on public.imobu_config;
create policy "imobu_config admins insertan" on public.imobu_config
  for insert to authenticated with check (public.imobu_es_admin());

drop policy if exists "imobu_config admins actualizan" on public.imobu_config;
create policy "imobu_config admins actualizan" on public.imobu_config
  for update to authenticated using (public.imobu_es_admin()) with check (public.imobu_es_admin());
-- Sin política de borrado: nadie puede eliminar los parámetros desde la API.

revoke insert, update, delete, truncate on public.imobu_config from anon;
revoke delete, truncate on public.imobu_config from authenticated;

-- 3. Historial de cambios (auditoría)
create table if not exists public.imobu_config_historial (
  id            bigint generated always as identity primary key,
  data          jsonb not null,
  cambiado      timestamptz not null default now(),
  cambiado_por  text
);
alter table public.imobu_config_historial enable row level security;

drop policy if exists "imobu_historial solo admins leen" on public.imobu_config_historial;
create policy "imobu_historial solo admins leen" on public.imobu_config_historial
  for select to authenticated using (public.imobu_es_admin());

revoke all on public.imobu_config_historial from anon;
revoke insert, update, delete, truncate on public.imobu_config_historial from authenticated;

-- Registra autor y fecha en cada guardado (no se puede falsificar desde el navegador)
create or replace function public.imobu_config_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actualizado := now();
  new.actualizado_por := coalesce(auth.jwt() ->> 'email', 'sistema');
  insert into public.imobu_config_historial (data, cambiado_por)
  values (new.data, new.actualizado_por);
  return new;
end;
$$;
revoke all on function public.imobu_config_auditar() from public, anon, authenticated;

drop trigger if exists imobu_config_auditar on public.imobu_config;
create trigger imobu_config_auditar
  before insert or update on public.imobu_config
  for each row execute function public.imobu_config_auditar();

-- 4. Agregar administradores (cambiar por los correos reales y ejecutar)
-- insert into public.imobu_admins (email) values ('nombre@imobu.cl');
