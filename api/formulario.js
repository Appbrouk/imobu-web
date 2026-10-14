// ─────────────────────────────────────────────────────────────
// IMOBU — receptor seguro de formularios (Vercel Serverless Function, Node 18+)
// Ruta: POST /api/formulario   ·   Ver SEGURIDAD.md para activarlo.
//
// Variables de entorno (se configuran en Vercel, NUNCA en el código ni en config.js):
//   ALLOWED_ORIGINS      Dominios permitidos, separados por coma. Ej: https://imobu.cl,https://www.imobu.cl
//   TURNSTILE_SECRET     Clave secreta de Cloudflare Turnstile (anti-bots). Recomendada.
//   RESEND_API_KEY       Clave de Resend para enviar el aviso por correo (opcional)
//   NOTIFY_EMAIL         Correo que recibe los formularios. Ej: contacto@imobu.cl
//   FROM_EMAIL           Remitente verificado en Resend. Ej: web@imobu.cl
//   FORWARD_WEBHOOK_URL  URL privada a la que reenviar los datos (CRM, Make, Zapier…) (opcional)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  Guardan cada lead en la tabla imobu_leads (ver supabase/leads.sql).
//                        La service_role es SECRETA: solo aquí, nunca en js/conexion.js ni en la intranet.
// ─────────────────────────────────────────────────────────────

const MAX_BYTES = 20000;
const LIMITE_POR_IP = 8;              // envíos permitidos por IP…
const VENTANA_MS = 10 * 60 * 1000;    // …cada 10 minutos (por instancia; para producción usar Upstash/Redis)
const intentos = new Map();

// Lista blanca de campos por formulario: [largo máximo, obligatorio]. Todo campo que no esté aquí se descarta.
const CAMPOS = {
  contacto: { nombre: [80, true], telefono: [20, true], email: [120], interes: [60, true], horario: [40], acepto: [5, true] },
  'registro-asesor': { nombre: [80, true], telefono: [20, true], email: [120, true], interes: [60, true], acepto: [5, true] },
  'postulacion-broker': {
    nombre: [80, true], telefono: [20, true], email: [120, true], comuna: [80, true], experiencia: [60, true],
    disponibilidad: [20, true], sii: [10], origen: [60], linkedin: [200], motivacion: [1000], acepto: [5, true]
  },
  evaluacion: {
    nombre: [80, true], apellido: [80, true], email: [120, true], telefono: [20, true], edad: [3, true], comuna_residencia: [80, true],
    estado_civil: [40, true], residencia: [60, true], situacion: [60, true], antiguedad: [30, true], renta: [20, true], otros_ingresos: [20],
    deuda_consumo: [20], deuda_tarjetas: [20], deuda_hipotecario: [20], propiedades: [30, true], dicom: [60, true],
    ahorro_pie: [20, true], ahorro_mensual: [20], complementa: [10, true], comp_relacion: [80], comp_renta: [20],
    comp_situacion: [60], comp_antiguedad: [30], objetivo: [40, true], cantidad: [10, true], comunas: [400], entrega: [60],
    plazo: [60, true], proyecto: [120], canal: [20, true], horario: [40], comentarios: [1000], acepto: [5, true]
  }
};
const COMUNES = { asesor: [60] };   // atribución al asesor (opcional, en todos los formularios)

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;

function limpiar(v, max) {
  return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}
function escHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
function limiteExcedido(ip) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  lista.push(ahora);
  intentos.set(ip, lista);
  return lista.length > LIMITE_POR_IP;
}

function validar(tipo, datos) {
  const reglas = CAMPOS[tipo];
  if (!reglas || typeof datos !== 'object' || datos === null || Array.isArray(datos)) return null;
  const limpio = {};
  const todas = { ...reglas, ...COMUNES };
  for (const [campo, [max, obligatorio]] of Object.entries(todas)) {
    let v = datos[campo];
    if (Array.isArray(v)) v = v.map(String).join(', ');
    if (v == null || v === '') {
      if (obligatorio) return null;
      continue;
    }
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    limpio[campo] = limpiar(v, max);
  }
  if (limpio.email && !EMAIL_RE.test(limpio.email)) return null;
  if (limpio.telefono) {
    const digitos = limpio.telefono.replace(/\D/g, '');
    if (digitos.length < 8 || digitos.length > 15) return null;
  }
  if (limpio.linkedin && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(limpio.linkedin)) delete limpio.linkedin;
  // El pre-diagnóstico se acepta solo como números (lo recalcula el asesor de todas formas)
  if (tipo === 'evaluacion' && datos.prediagnostico && typeof datos.prediagnostico === 'object') {
    const p = datos.prediagnostico;
    limpio.prediagnostico = {
      status: limpiar(p.status || '', 40),
      precioUF: Number(p.precioUF) || 0,
      creditoUF: Number(p.creditoUF) || 0,
      dividendo: Number(p.dividendo) || 0,
      carga: Number(p.carga) || 0
    };
  }
  return limpio;
}

async function verificarTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET) return true; // sin clave configurada se omite (no recomendado en producción)
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  return j.success === true;
}

// Guarda el lead y avisa. Falla solo si NINGÚN destino lo recibió (si el correo cae, queda en la base).
async function notificar(tipo, datos, pagina) {
  const tareas = [];
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SUPABASE_URL && sbKey) {
    tareas.push(fetch(`${process.env.SUPABASE_URL}/rest/v1/imobu_leads`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ tipo, pagina, asesor: datos.asesor || null, datos })
    }));
  }
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL && process.env.FROM_EMAIL) {
    const filas = Object.entries(datos).map(([k, v]) =>
      `<tr><th align="left" style="padding:4px 12px 4px 0">${escHtml(k)}</th><td>${escHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('');
    tareas.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: process.env.NOTIFY_EMAIL.split(',').map((s) => s.trim()),
        subject: `Nuevo formulario web: ${tipo}${datos.asesor ? ' · asesor ' + datos.asesor : ''}`,
        html: `<p>Formulario <b>${escHtml(tipo)}</b> desde <b>${escHtml(pagina)}</b></p><table>${filas}</table>`
      })
    }));
  }
  if (process.env.FORWARD_WEBHOOK_URL) {
    tareas.push(fetch(process.env.FORWARD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, pagina, recibido: new Date().toISOString(), datos })
    }));
  }
  const resultados = await Promise.allSettled(tareas);
  if (tareas.length && resultados.every((r) => r.status === 'rejected' || (r.value && !r.value.ok))) throw new Error('destino');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Solo POST con JSON desde los dominios permitidos
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const permitidos = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origen = req.headers.origin || '';
  if (!permitidos.length || !permitidos.includes(origen)) return res.status(403).json({ ok: false });
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ ok: false });
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return res.status(413).json({ ok: false });

  const ip = ipDe(req);
  if (limiteExcedido(ip)) return res.status(429).json({ ok: false });

  const cuerpo = typeof req.body === 'object' && req.body !== null ? req.body : {};
  if (JSON.stringify(cuerpo).length > MAX_BYTES) return res.status(413).json({ ok: false });

  // Trampa para bots: si viene el campo oculto, se responde OK sin procesar
  if (cuerpo.datos && cuerpo.datos.sitio_web_empresa) return res.status(200).json({ ok: true });

  const tipo = String(cuerpo.tipo || '');
  const datos = validar(tipo, cuerpo.datos);
  if (!datos || datos.acepto == null) return res.status(400).json({ ok: false });

  try {
    if (!(await verificarTurnstile(cuerpo.turnstileToken, ip))) return res.status(403).json({ ok: false });
    await notificar(tipo, datos, limpiar(cuerpo.pagina || '', 60));
    // No se registran los datos personales en los logs (contienen información financiera)
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('formulario: error al entregar', tipo);
    return res.status(502).json({ ok: false });
  }
}
