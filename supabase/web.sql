-- ─────────────────────────────────────────────────────────────
-- BROUK WEBS — base compartida de IMOBU (imobu.cl) y MD Invest (mdiaz.cl)
-- Supabase / PostgreSQL. Ejecutar una vez en el SQL Editor (o como migración).
--
-- Qué guarda:
--  · web_admins      correos que pueden entrar a la intranet (una sola intranet para ambas webs)
--  · web_sitios      parámetros de cada web (contacto, finanzas, formularios…) en un JSON por sitio
--  · web_proyectos   catálogo ÚNICO de proyectos; la columna `sitios` dice en qué webs se muestra
--  · web_leads       todos los formularios de ambas webs, con la columna `sitio` de origen
--  · web_historial   auditoría de cada cambio en sitios y proyectos (quién, cuándo, qué)
--
-- Seguridad:
--  · Lectura pública solo de lo que las webs necesitan (parámetros publicados y proyectos activos).
--  · Escritura SOLO para usuarios autenticados que estén en web_admins y con correo confirmado.
--  · Los leads los inserta el servidor de cada web con la clave anon (solo INSERT, columnas fijas);
--    los leen y gestionan únicamente los administradores. Ninguna service_role en las webs.
--  · La lista de administradores no es accesible desde la API.
-- ─────────────────────────────────────────────────────────────

-- 1. Administradores (se agregan por SQL; nadie puede auto-agregarse)
create table if not exists public.web_admins (
  email   text primary key check (email = lower(email) and email like '%@%'),
  creado  timestamptz not null default now()
);
alter table public.web_admins enable row level security;
revoke all on public.web_admins from anon, authenticated;

create or replace function public.web_es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.web_admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.web_es_admin() from public, anon;
grant execute on function public.web_es_admin() to authenticated;

-- Autor y fecha en cada guardado (no se puede falsificar desde el navegador)
create or replace function public.web_marcar_autor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actualizado := now();
  new.actualizado_por := coalesce(auth.jwt() ->> 'email', 'sistema');
  return new;
end;
$$;
revoke all on function public.web_marcar_autor() from public, anon, authenticated;

-- 2. Sitios: un registro por web, con sus parámetros publicados
create table if not exists public.web_sitios (
  id              text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  nombre          text not null check (length(nombre) between 1 and 80),
  url             text not null check (url ~ '^https://'),
  config          jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 200000),
  actualizado     timestamptz not null default now(),
  actualizado_por text
);
alter table public.web_sitios enable row level security;

drop policy if exists "web_sitios lectura publica" on public.web_sitios;
create policy "web_sitios lectura publica" on public.web_sitios
  for select to anon, authenticated using (true);
drop policy if exists "web_sitios admins insertan" on public.web_sitios;
create policy "web_sitios admins insertan" on public.web_sitios
  for insert to authenticated with check (public.web_es_admin());
drop policy if exists "web_sitios admins actualizan" on public.web_sitios;
create policy "web_sitios admins actualizan" on public.web_sitios
  for update to authenticated using (public.web_es_admin()) with check (public.web_es_admin());
-- Sin política de borrado: un sitio no se elimina desde la API.
revoke insert, update, delete, truncate on public.web_sitios from anon;
revoke delete, truncate on public.web_sitios from authenticated;

drop trigger if exists web_sitios_autor on public.web_sitios;
create trigger web_sitios_autor before insert or update on public.web_sitios
  for each row execute function public.web_marcar_autor();

-- 3. Proyectos: catálogo único para ambas webs
create table if not exists public.web_proyectos (
  id              text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  nombre          text not null check (length(nombre) between 1 and 80),
  inmobiliaria    text not null default '' check (length(inmobiliaria) <= 80),
  comuna          text not null default '' check (length(comuna) <= 80),
  uf              numeric not null default 0 check (uf >= 0 and uf < 1000000),       -- precio "desde", en UF
  entrega         text not null default 'inmediata' check (entrega in ('inmediata', 'futura')),
  dorm            smallint[] not null default '{1}',                                 -- tipologías: 0 = studio
  m2              text not null default '' check (length(m2) <= 40),                 -- "30 a 55 m²"
  etiqueta        text not null default '' check (length(etiqueta) <= 40),           -- texto corto extra (vacío = según entrega)
  resumen         text not null default '' check (length(resumen) <= 300),
  descripcion     text[] not null default '{}',                                      -- párrafos de la ficha
  datos           jsonb not null default '[]'::jsonb check (jsonb_typeof(datos) = 'array'),   -- [["Dirección","…"], …]
  fotos           jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'),   -- [{"src":"https://… o photo-… de Unsplash","alt":"…"}]
  enlace          text not null default '' check (enlace = '' or enlace ~ '^https://'),
  sitios          text[] not null default '{}',                                      -- en qué webs se muestra: imobu, mdiaz
  destacado       boolean not null default false,                                    -- en el inicio de IMOBU
  ejemplo         boolean not null default false,                                    -- proyecto de ejemplo (no real)
  activo          boolean not null default true,                                     -- false = oculto en todas las webs
  orden           integer not null default 0,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  actualizado_por text,
  check (pg_column_size(descripcion) + pg_column_size(datos) + pg_column_size(fotos) < 60000)
);
create index if not exists web_proyectos_orden on public.web_proyectos (orden, nombre);
alter table public.web_proyectos enable row level security;

drop policy if exists "web_proyectos lectura publica" on public.web_proyectos;
create policy "web_proyectos lectura publica" on public.web_proyectos
  for select to anon using (activo);
drop policy if exists "web_proyectos lectura autenticada" on public.web_proyectos;
create policy "web_proyectos lectura autenticada" on public.web_proyectos
  for select to authenticated using (true);
drop policy if exists "web_proyectos admins insertan" on public.web_proyectos;
create policy "web_proyectos admins insertan" on public.web_proyectos
  for insert to authenticated with check (public.web_es_admin());
drop policy if exists "web_proyectos admins actualizan" on public.web_proyectos;
create policy "web_proyectos admins actualizan" on public.web_proyectos
  for update to authenticated using (public.web_es_admin()) with check (public.web_es_admin());
drop policy if exists "web_proyectos admins borran" on public.web_proyectos;
create policy "web_proyectos admins borran" on public.web_proyectos
  for delete to authenticated using (public.web_es_admin());
revoke insert, update, delete, truncate on public.web_proyectos from anon;
revoke truncate on public.web_proyectos from authenticated;

drop trigger if exists web_proyectos_autor on public.web_proyectos;
create trigger web_proyectos_autor before insert or update on public.web_proyectos
  for each row execute function public.web_marcar_autor();

-- 4. Leads: todos los formularios de ambas webs
create table if not exists public.web_leads (
  id        bigint generated always as identity primary key,
  recibido  timestamptz not null default now(),
  sitio     text not null references public.web_sitios (id),
  tipo      text not null check (length(tipo) between 1 and 40),
  pagina    text check (length(pagina) <= 80),
  asesor    text check (length(asesor) <= 60),
  datos     jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 50000),
  estado    text not null default 'Nuevo' check (estado in ('Nuevo', 'Contactado', 'Reunion', 'Entrevista', 'Aceptado', 'Cliente', 'Activo', 'Descartado')),
  notas     text not null default '' check (length(notas) <= 1000)
);
create index if not exists web_leads_recibido on public.web_leads (recibido desc);
create index if not exists web_leads_sitio on public.web_leads (sitio, tipo);
alter table public.web_leads enable row level security;

drop policy if exists "web_leads insercion desde las webs" on public.web_leads;
create policy "web_leads insercion desde las webs" on public.web_leads
  for insert to anon with check (true);
drop policy if exists "web_leads admins leen" on public.web_leads;
create policy "web_leads admins leen" on public.web_leads
  for select to authenticated using (public.web_es_admin());
drop policy if exists "web_leads admins actualizan" on public.web_leads;
create policy "web_leads admins actualizan" on public.web_leads
  for update to authenticated using (public.web_es_admin()) with check (public.web_es_admin());

-- Permisos al ras: anon solo inserta, y solo estas columnas; los admins solo cambian estado y notas.
revoke all on public.web_leads from anon, authenticated;
grant insert (sitio, tipo, pagina, asesor, datos) on public.web_leads to anon;
grant select on public.web_leads to authenticated;
grant update (estado, notas) on public.web_leads to authenticated;

-- 5. Historial (auditoría de sitios y proyectos)
create table if not exists public.web_historial (
  id            bigint generated always as identity primary key,
  tabla         text not null,
  clave         text not null,
  accion        text not null,
  data          jsonb,
  cambiado      timestamptz not null default now(),
  cambiado_por  text
);
create index if not exists web_historial_cambiado on public.web_historial (cambiado desc);
alter table public.web_historial enable row level security;

drop policy if exists "web_historial solo admins leen" on public.web_historial;
create policy "web_historial solo admins leen" on public.web_historial
  for select to authenticated using (public.web_es_admin());
revoke all on public.web_historial from anon;
revoke insert, update, delete, truncate on public.web_historial from authenticated;

create or replace function public.web_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.web_historial (tabla, clave, accion, data, cambiado_por)
  values (tg_table_name, fila ->> 'id', lower(tg_op), fila, coalesce(auth.jwt() ->> 'email', 'sistema'));
  return coalesce(new, old);
end;
$$;
revoke all on function public.web_auditar() from public, anon, authenticated;

drop trigger if exists web_sitios_auditar on public.web_sitios;
create trigger web_sitios_auditar after insert or update or delete on public.web_sitios
  for each row execute function public.web_auditar();
drop trigger if exists web_proyectos_auditar on public.web_proyectos;
create trigger web_proyectos_auditar after insert or update or delete on public.web_proyectos
  for each row execute function public.web_auditar();

-- 6. Los dos sitios, con los parámetros que hoy usan las webs (se editan después desde la intranet)
insert into public.web_sitios (id, nombre, url, config) values
  ('imobu', 'IMOBU', 'https://imobu.cl', '{
    "sitio": { "nombre": "IMOBU Asesoría Inmobiliaria", "telefono": "+56 9 8433 6430", "whatsapp": "56984336430", "email": "contacto@imobu.cl",
               "direccion": "Badajoz 130, Las Condes", "horario": "Lunes a viernes, 9:00 a 18:30 h",
               "instagram": "https://www.instagram.com/imobu.cl/", "facebook": "https://www.facebook.com/imobuasesoria/", "linkedin": "https://www.linkedin.com/company/imobu/" },
    "cifras": { "experiencia": "+8 años", "inversionistas": "+450", "inmobiliarias": "12" },
    "finanzas": { "uf": 41065, "tasaAnual": 4.5, "plazoAnos": 25, "piePct": 20, "dividendoMaxPct": 25, "cargaMaxPct": 45, "rentaMinima": 650000 },
    "brokers": { "comisionPct": 1, "proximaGeneracion": "Lunes 2 de noviembre", "duracionOnboarding": "4 semanas" },
    "formularios": { "endpoint": "/api/formulario", "turnstileSiteKey": "" },
    "asesores": [ { "id": "marcela-diaz", "nombre": "Marcela Díaz", "cargo": "Asesora en inversiones inmobiliarias", "whatsapp": "56951497482", "telefono": "+56 9 5149 7482",
                    "instagram": "https://www.instagram.com/marceladiazinversiones/", "tiktok": "https://www.tiktok.com/@marceladiazinversiones",
                    "linkedin": "https://www.linkedin.com/in/marcela-diaz-carvajal-325b1a1b1/", "facebook": "https://www.facebook.com/profile.php?id=100094086452130",
                    "foto": "https://mdiaz.cl/assets/marce-hero.jpeg", "fotoTrabajo": "https://mdiaz.cl/assets/marce-pc.jpeg", "fotoLlamada": "https://mdiaz.cl/assets/marce-llamada.jpeg" } ]
  }'::jsonb),
  ('mdiaz', 'MD Invest', 'https://mdiaz.cl', '{
    "sitio": { "nombre": "Marcela Díaz Inversiones", "telefono": "+56 9 5149 7482", "whatsapp": "56951497482", "email": "",
               "direccion": "Badajoz 130 oficina 1302, Santiago RM",
               "instagram": "https://www.instagram.com/marceladiazinversiones/", "tiktok": "https://www.tiktok.com/@marceladiazinversiones",
               "linkedin": "https://www.linkedin.com/in/marcela-diaz-carvajal-325b1a1b1/", "facebook": "https://www.facebook.com/profile.php?id=100094086452130" },
    "finanzas": { "uf": 41065, "tasaAnual": 4.5, "plazoAnos": 25, "piePct": 20, "dividendoMaxPct": 25, "cargaMaxPct": 45, "rentaMinima": 650000 },
    "formularios": { "turnstileSiteKey": "" },
    "hubspot": { "portalId": "51801072", "formGuid": "a8d33577-b4ec-4884-a984-08a08e1fe5e0", "region": "na1" }
  }'::jsonb)
on conflict (id) do nothing;

-- 7. Agregar administradores (cambiar por los correos reales y ejecutar)
-- insert into public.web_admins (email) values ('nombre@imobu.cl') on conflict do nothing;
