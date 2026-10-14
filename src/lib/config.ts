// Parámetros del sitio resueltos en build: lo publicado desde la intranet (Supabase) sobre src/data/config.json.
// Sin SUPABASE_URL / SUPABASE_ANON_KEY (p. ej. en local) se usa solo el JSON del repositorio.
import local from '../data/config.json';

export type Proyecto = (typeof local.proyectos)[number];
let config: typeof local = local;

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
if (url && key) {
  try {
    const r = await fetch(`${url}/rest/v1/imobu_config?id=eq.1&select=data`, {
      headers: key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key },
      signal: AbortSignal.timeout(5000)
    });
    const filas = r.ok ? await r.json() : [];
    if (Array.isArray(filas) && filas[0]?.data && typeof filas[0].data === 'object') config = { ...local, ...filas[0].data };
  } catch (e) {
    console.warn('[config] no se pudo leer Supabase, se usa src/data/config.json');
  }
}
export default config;
