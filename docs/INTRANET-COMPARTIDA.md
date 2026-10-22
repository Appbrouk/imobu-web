# Intranet compartida IMOBU + MD Invest — roadmap y estado

Una sola base (proyecto Supabase de la organización IMOBU), una sola intranet
(`imobu.cl/intranet.html`) y dos webs que leen de ahí: **imobu.cl** (Astro, este
repositorio) y **mdiaz.cl** (estático, repositorio `marcela-inversiones`).

```
                    ┌──────────────────────────────┐
                    │   Supabase (org. IMOBU)      │
                    │   web_sitios   parámetros    │
   intranet ───────▶│   web_proyectos catálogo     │◀─────── intranet (mismo login)
   (imobu.cl/       │   web_leads    formularios   │
    intranet.html)  │   web_historial auditoría    │
                    └──────┬───────────────┬───────┘
         lectura (anon)    │               │   lectura (anon)
                           ▼               ▼
                  imobu.cl (build +    mdiaz.cl (/api/proyectos
                  /api/config)         en tiempo real)
                           ▲               ▲
         /api/formulario ──┘               └── /api/formulario
         (INSERT en web_leads, sitio=imobu)    (INSERT en web_leads, sitio=mdiaz)
```

## Roadmap

| # | Paso | Estado |
|---|------|--------|
| 1 | Esquema compartido `supabase/web.sql`: sitios, proyectos, leads, historial, admins, RLS | Listo (en este repo) |
| 2 | imobu.cl lee parámetros y proyectos de la base (`src/lib/web-db.mjs`, `api/config.js`) | Listo |
| 3 | Formularios de imobu.cl → `web_leads` con la clave pública (sin service_role) | Listo |
| 4 | Intranet compartida: proyectos con "mostrar en", formularios de ambas webs, parámetros por web, historial | Listo |
| 5 | mdiaz.cl lee catálogo y parámetros (`api/proyectos.mjs`) y envía registro + evaluación a `web_leads` | Listo |
| 6 | Proyecto Supabase `imobu-mdiaz` en la organización IMOBU (plan free) | Listo (creado por IMOBU) |
| 7 | Ejecutar `supabase/web.sql`; agregar administradores; invitar usuarios en Authentication | Esquema aplicado y braulio@brouk.cl como admin. **Pendiente: invitar usuarios en Authentication** |
| 8 | Cargar el catálogo con los datos definitivos (desde la intranet, o `catalogo-actual.sql` como punto de partida) | Pendiente (datos por entregar) |
| 9 | Conectar: `public/js/conexion.js` + variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` en los dos proyectos de Vercel | Listo |
| 10 | Deploy hook de Vercel para imobu.cl (`VERCEL_DEPLOY_HOOK_URL`) para regenerar las fichas al cambiar proyectos | Pendiente |
| 11 | Probar de punta a punta: crear proyecto en la intranet → aparece en ambas webs; enviar cada formulario → aparece en Formularios | Pendiente |

## Cómo fluye cada cosa

**Proyectos.** La intranet escribe directo en `web_proyectos`. Cada proyecto tiene
`sitios` (en qué webs se muestra), `activo`, `destacado` (inicio de IMOBU),
`ejemplo`, y los campos de ambas fichas (tipologías, superficies, resumen,
descripción, datos, fotos, enlace). Al guardar:

- mdiaz.cl lo muestra en menos de un minuto (`/api/proyectos`, caché de 60 s).
- imobu.cl actualiza textos, precios y catálogo al instante (`/api/config`) y
  regenera las fichas `/proyectos/<id>.html` con un redeploy que la intranet pide
  sola (`api/rebuild.js`, agrupado cada 3 s).

**Parámetros de cada web.** Se editan como borrador en las pestañas *Web IMOBU* y
*Web MD Invest* y se publican con *Guardar y publicar* (`web_sitios.config`).

**Formularios.** Las funciones `api/formulario.*` de cada web validan, limpian y
hacen `INSERT` en `web_leads` con la clave pública (solo puede insertar). La
pestaña *Formularios* los muestra juntos, con filtros por web, tipo y estado.

**Seguridad.** Mismo modelo que tenía IMOBU: login con Supabase Auth, solo los
correos de `web_admins` con correo confirmado pueden escribir (lo decide la base
vía RLS, no la página), sin `service_role` en ninguna web, historial con autor.

## Activación (cuando exista el proyecto Supabase)

1. SQL Editor → ejecutar `supabase/web.sql` (crea todo y los dos sitios).
2. `insert into public.web_admins (email) values ('correo@imobu.cl');` por cada administrador.
3. Authentication → Users → *Invite user* con esos correos; desactivar el registro
   público; agregar `https://imobu.cl/intranet.html` como URL de redirección.
4. Copiar *Project URL* y *publishable key* en `public/js/conexion.js` y en las
   variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` de **ambos** proyectos de Vercel.
5. Vercel (imobu-web) → Settings → Git → Deploy Hooks → crear uno para `main` y
   guardarlo como `VERCEL_DEPLOY_HOOK_URL`.
6. Opcional: `supabase/catalogo-actual.sql` carga los proyectos que hoy muestran
   las dos webs; si no, se crean desde la intranet.
