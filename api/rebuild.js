// ─────────────────────────────────────────────────────────────
// IMOBU — regenera el sitio tras publicar desde la intranet (Vercel Serverless Function)
// Ruta: POST /api/rebuild con Authorization: Bearer <token de sesión de Supabase del administrador>
// Variables: SUPABASE_URL, SUPABASE_ANON_KEY y VERCEL_DEPLOY_HOOK_URL (Vercel → Settings → Git → Deploy Hooks).
// Las fichas de proyecto se generan en build, por eso un cambio publicado necesita un redeploy.
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key, VERCEL_DEPLOY_HOOK_URL: hook } = process.env;
  if (!url || !key || !hook) return res.status(200).json({ ok: false, motivo: 'sin hook configurado' });
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt || jwt.length > 4096) return res.status(401).json({ ok: false });
  // Solo un administrador de la intranet puede pedir el redeploy: lo decide la base (imobu_es_admin)
  const r = await fetch(`${url}/rest/v1/rpc/imobu_es_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!r.ok || (await r.json()) !== true) return res.status(403).json({ ok: false });
  const h = await fetch(hook, { method: 'POST' });
  return res.status(h.ok ? 200 : 502).json({ ok: h.ok });
}
