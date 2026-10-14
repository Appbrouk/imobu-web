// ─────────────────────────────────────────────────────────────
// IMOBU — parámetros publicados desde la intranet (Vercel Serverless Function)
// Ruta: GET /api/config  →  JavaScript que reemplaza los valores de js/config.js.
// Variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY (públicas; la escritura la protege la base de datos).
// Si algo falla, responde un comentario vacío y el sitio sigue usando js/config.js.
// ─────────────────────────────────────────────────────────────

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${url}/rest/v1/imobu_config?id=eq.1&select=data`, {
      // Claves nuevas (sb_publishable_…) van solo en apikey; las antiguas (JWT) también en Authorization
      headers: key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    const filas = r.ok ? await r.json() : [];
    if (!Array.isArray(filas) || !filas.length || typeof filas[0].data !== 'object') {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      return res.status(200).send('/* sin parámetros publicados: se usa js/config.js */');
    }
    // JSON seguro para incrustar en JavaScript
    const json = JSON.stringify(filas[0].data)
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
