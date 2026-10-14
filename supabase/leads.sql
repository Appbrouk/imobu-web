-- ─────────────────────────────────────────────────────────────
-- IMOBU — Leads recibidos por los formularios (Supabase / PostgreSQL)
-- Ejecutar DESPUÉS de intranet.sql (usa la función imobu_es_admin).
--
-- Seguridad:
--  · Inserta solo el servidor (api/formulario.js con SUPABASE_SERVICE_ROLE_KEY, que no pasa por RLS).
--  · Leen solo los administradores autenticados, que además gestionan estado y notas
--    (pestaña Postulantes de la intranet). Nadie borra ni toca el resto desde la API.
--  · Contiene datos personales y financieros: revisar el plazo de retención en legal.html.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.imobu_leads (
  id        bigint generated always as identity primary key,
  recibido  timestamptz not null default now(),
  tipo      text not null,
  pagina    text,
  asesor    text,
  datos     jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 50000),
  estado    text not null default 'Nuevo' check (estado in ('Nuevo', 'Contactado', 'Entrevista', 'Aceptado', 'Activo', 'Descartado')),
  notas     text not null default '' check (length(notas) <= 1000)
);
create index if not exists imobu_leads_recibido on public.imobu_leads (recibido desc);
alter table public.imobu_leads enable row level security;

drop policy if exists "imobu_leads admins leen" on public.imobu_leads;
create policy "imobu_leads admins leen" on public.imobu_leads
  for select to authenticated using (public.imobu_es_admin());

drop policy if exists "imobu_leads admins actualizan" on public.imobu_leads;
create policy "imobu_leads admins actualizan" on public.imobu_leads
  for update to authenticated using (public.imobu_es_admin()) with check (public.imobu_es_admin());

revoke all on public.imobu_leads from anon;
revoke insert, update, delete, truncate on public.imobu_leads from authenticated;
grant update (estado, notas) on public.imobu_leads to authenticated;  -- solo esas dos columnas
