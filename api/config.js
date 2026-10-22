// ─────────────────────────────────────────────────────────────
// IMOBU — parámetros publicados desde la intranet (Vercel Serverless Function)
// Ruta: GET /api/config  →  JavaScript que reemplaza los valores de js/config.js
// (parámetros del sitio + proyectos activos de la base compartida, ver supabase/web.sql).
// Variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY (públicas; la escritura la protege la base de datos).
// Si algo falla, responde un comentario vacío y el sitio sigue usando js/config.js (generado en build).
// ─────────────────────────────────────────────────────────────
import { leerConfigImobu } from '../src/lib/web-db.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send('/* intranet no conectada: se usa js/config.js */');
  }

  try {
    const config = await leerConfigImobu({ url, key, timeout: 2500 });
    if (!config) {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      return res.status(200).send('/* sin parámetros publicados: se usa js/config.js */');
    }
    // JSON seguro para incrustar en JavaScript
    const json = JSON.stringify(config)
      .replace(/</g, '\\u003c')
      .split(String.fromCharCode(0x2028)).join('\\u2028')
      .split(String.fromCharCode(0x2029)).join('\\u2029');
    // CDN: 30 s de caché y luego se sirve la versión anterior mientras se actualiza
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    return res.status(200).send(`window.IMOBU_CONFIG = Object.assign({}, window.IMOBU_CONFIG || {}, ${json});`);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send('/* parámetros no disponibles: se usa js/config.js */');
  }
}
