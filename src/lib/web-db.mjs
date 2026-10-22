// ─────────────────────────────────────────────────────────────
// IMOBU — lectura de la base compartida (Supabase, ver supabase/web.sql)
// Lo usan el build de Astro (src/lib/config.ts) y las funciones de Vercel (api/config.js).
// Solo lectura con la clave pública (anon): parámetros del sitio y proyectos activos.
// ─────────────────────────────────────────────────────────────
export const SITIO = 'imobu';

export function cabeceras(key) {
  // Claves nuevas (sb_publishable_…) van solo en apikey; las antiguas (JWT) también en Authorization
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

async function leer(url, key, ruta, ms) {
  const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${ruta}`, { headers: cabeceras(key), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

// Foto de portada: el sitio acepta un ID de Unsplash ("photo-…") o una URL https
export function fotoDe(p) {
  const f = Array.isArray(p.fotos) && p.fotos[0] && typeof p.fotos[0] === 'object' ? p.fotos[0] : null;
  return { foto: f && typeof f.src === 'string' ? f.src : '', alt: f && typeof f.alt === 'string' ? f.alt : '' };
}

// Fila de web_proyectos → forma que usan las páginas de IMOBU (tarjetas, fichas, evaluación)
export function proyectoImobu(p) {
  const { foto, alt } = fotoDe(p);
  return {
    id: String(p.id),
    nombre: String(p.nombre || ''),
    inmobiliaria: String(p.inmobiliaria || ''),
    comuna: String(p.comuna || ''),
    uf: Number(p.uf) || 0,
    entrega: p.entrega === 'futura' ? 'futura' : 'inmediata',
    dorm: Array.isArray(p.dorm) && p.dorm.length ? p.dorm.map(Number) : [1],
    m2: String(p.m2 || ''),
    destacado: !!p.destacado,
    ejemplo: !!p.ejemplo,
    foto,
    alt,
    resumen: String(p.resumen || ''),
    descripcion: Array.isArray(p.descripcion) ? p.descripcion.map(String) : [],
    datos: Array.isArray(p.datos) ? p.datos : [],
    fotos: Array.isArray(p.fotos) ? p.fotos : [],
    etiqueta: String(p.etiqueta || ''),
    enlace: String(p.enlace || '')
  };
}

// Parámetros publicados + proyectos activos de IMOBU. Devuelve null si la base no está configurada
// o no responde: quien llama decide el respaldo (src/data/config.json). Si la base aún no tiene
// proyectos para IMOBU, no se incluye `proyectos` y se conserva el catálogo de respaldo.
export async function leerConfigImobu({ url, key, timeout = 5000 } = {}) {
  if (!url || !key) return null;
  const [sitios, proyectos] = await Promise.all([
    leer(url, key, `web_sitios?id=eq.${SITIO}&select=config`, timeout),
    leer(url, key, `web_proyectos?select=*&activo=eq.true&sitios=cs.{${SITIO}}&order=orden.asc,nombre.asc`, timeout)
  ]);
  const config = Array.isArray(sitios) && sitios[0] && sitios[0].config && typeof sitios[0].config === 'object' ? sitios[0].config : null;
  if (!config) return null;
  const lista = (Array.isArray(proyectos) ? proyectos : []).map(proyectoImobu);
  return lista.length ? { ...config, proyectos: lista } : { ...config };
}
