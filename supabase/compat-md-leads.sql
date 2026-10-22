-- ─────────────────────────────────────────────────────────────
-- COMPATIBILIDAD TEMPORAL (ya aplicada en el proyecto imobu-mdiaz el 22-10-2026)
-- La versión de mdiaz.cl que estaba en producción antes de la rama compartida inserta en
-- una tabla md_leads. Esta vista redirige esos envíos a web_leads (sitio = 'mdiaz') para que
-- ningún formulario se pierda mientras se despliega la rama nueva.
-- Cuando mdiaz.cl ya use api/formulario.mjs, se puede eliminar:
--   drop view public.md_leads; drop function public.md_leads_insertar();
-- ─────────────────────────────────────────────────────────────
create view public.md_leads with (security_invoker = true) as
  select id, recibido, tipo, pagina, datos, estado, notas from public.web_leads where sitio = 'mdiaz';

create or replace function public.md_leads_insertar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.web_leads (sitio, tipo, pagina, datos) values ('mdiaz', new.tipo, new.pagina, new.datos);
  return new;
end;
$$;

create trigger md_leads_insertar instead of insert on public.md_leads
  for each row execute function public.md_leads_insertar();

revoke all on public.md_leads from anon, authenticated;
grant insert (tipo, pagina, datos) on public.md_leads to anon;
