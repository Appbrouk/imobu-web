# Seguridad de los formularios — IMOBU

Los formularios piden datos personales y financieros (renta, deudas, DICOM). Por eso la protección está en **dos capas**: el navegador frena lo básico y el **servidor** es el que realmente protege. Una página sola, sin servidor, nunca es segura por sí misma.

## Lo que ya está hecho

**En el navegador (`js/imobu.js`)**
- Trampa para bots (campo oculto "honeypot"): si un robot lo llena, se le responde "éxito" sin enviar nada.
- Tiempo mínimo de llenado (3 segundos) y máximo 5 envíos cada 10 minutos por navegador.
- Largos máximos en todos los campos, validación de correo y teléfono, y limpieza de caracteres peligrosos (`<`, `>`, caracteres de control).
- Los datos del usuario nunca se insertan como código en la página (se escapan), así que no se puede inyectar HTML ni scripts.
- Soporte para Cloudflare Turnstile (el "no soy un robot" sin imágenes).
- Ninguna clave secreta está en el sitio.

**En el servidor (`api/formulario.js`)** — probado contra 12 tipos de ataque
- Solo acepta `POST` con JSON, desde los dominios autorizados (bloquea envíos desde otros sitios).
- Lista blanca de campos por formulario: lo que no está permitido se descarta.
- Límite de tamaño (20 KB) y de envíos por IP.
- Verificación de Turnstile en el servidor.
- Valida obligatorios, correo, teléfono y largos; limpia el texto antes de reenviarlo.
- No guarda datos personales en los registros del servidor.
- Las claves (Resend, Turnstile, webhook) viven en variables de entorno, nunca en el código.

**En el hosting (`vercel.json`)**
- HTTPS obligatorio (HSTS), política de contenido (CSP), protección contra clickjacking, `nosniff`, política de referencias y de permisos.
- La intranet no se indexa en buscadores ni se guarda en caché (`noindex`, `no-store`).

## Cómo activarlo (Vercel, gratis para este volumen)

1. Sube la carpeta `imobu-web` a un proyecto de Vercel (o conéctalo a un repositorio de GitHub).
2. Crea una cuenta en [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) y agrega el dominio `imobu.cl`. Obtendrás una **site key** (pública) y una **secret key** (privada).
3. En Vercel → Settings → Environment Variables, agrega:
   - `ALLOWED_ORIGINS` = `https://imobu.cl,https://www.imobu.cl`
   - `TURNSTILE_SECRET` = la secret key de Turnstile
   - Para recibir por correo: `RESEND_API_KEY`, `NOTIFY_EMAIL` (ej. `contacto@imobu.cl`) y `FROM_EMAIL` (un remitente verificado en Resend)
   - Para que los clientes (contacto y evaluación) lleguen a brouk.app: `FORWARD_WEBHOOK_URL` y `FORWARD_WEBHOOK_TOKEN`, los entrega el equipo de Brouk. Los postulantes a broker no se reenvían: se gestionan en la pestaña Postulantes de la intranet.
   - Para guardar cada lead en la base (recomendado: si el correo falla, el dato no se pierde): ejecuta `supabase/leads.sql` después de `intranet.sql` y agrega `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role). Esta clave es **secreta**: solo en Vercel, nunca en el código. Los leads se leen desde Supabase → Table Editor → `imobu_leads`.
4. En la intranet → Formularios: escribe `/api/formulario` como receptor y pega la **site key** de Turnstile. Presiona **Guardar y publicar** (o, en modo local, descarga `config.js` y reemplázalo).
5. Prueba cada formulario una vez publicado.

Mientras el receptor esté vacío, los formularios funcionan en **modo demostración**: validan y muestran la confirmación, pero no envían nada.

## Intranet (parámetros del sitio con clave)

Botón **Intranet** al final de cada página → `intranet.html`.

**Cómo protege**
- Ingreso real con correo y clave (Supabase Auth): las claves se guardan cifradas y el servidor limita los intentos. Además, la página bloquea un minuto tras 5 intentos fallidos.
- Solo pueden publicar los correos de la tabla `imobu_admins`, con el correo confirmado. Lo verifica **la base de datos** (reglas RLS), no la página: aunque alguien manipule el navegador, no puede escribir.
- Nadie puede autoasignarse como administrador ni borrar los parámetros desde internet.
- Cada publicación queda en el historial con autor y fecha, y se puede restaurar una versión anterior.
- La sesión se cierra sola tras 30 minutos sin actividad. Las claves nuevas deben tener 12+ caracteres con letras y números.
- La librería de Supabase se carga con versión fija y huella de integridad (SRI).

**Cómo activarla**
1. En Supabase, abre el SQL Editor y ejecuta `supabase/intranet.sql`.
2. Agrega a los administradores: `insert into public.imobu_admins (email) values ('correo@imobu.cl');`
3. En Authentication → Users → **Invite user**, invita esos mismos correos: recibirán un enlace para crear su clave en la intranet.
4. En Authentication → Sign In / Providers, **desactiva el registro público** ("Allow new users to sign up") y deja activa la confirmación de correo.
5. En Authentication → URL Configuration, agrega `https://imobu.cl/intranet.html` como URL de redirección permitida.
6. Copia la *Project URL* y la *anon / publishable key* en `js/conexion.js` (son públicas por diseño). Nunca uses la `service_role`.
7. En Vercel agrega las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` (las mismas) para que `/api/config` entregue los parámetros publicados.

Mientras `js/conexion.js` esté vacío, la intranet funciona en **modo local**: sin clave, solo genera `config.js` para subirlo a mano (no puede cambiar el sitio publicado).

## Buenas prácticas que dependen del equipo

- No reenvíes los formularios a una planilla compartida con enlace público.
- Da acceso a los datos solo a quien lo necesita, y borra lo que ya no se usa (ver plazo en `legal.html`).
- Revisa `legal.html` con un abogado (Ley 19.628 y Ley 21.719).
- Los scripts de cada página están en `js/` (no inline), por eso la CSP no permite `'unsafe-inline'` en scripts: cualquier `<script>` escrito dentro de un HTML será bloqueado en producción.
- Mejora futura: usar un límite de envíos compartido (por ejemplo, Upstash) si el tráfico crece; el actual es por instancia.
