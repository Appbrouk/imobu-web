// Parámetros del sitio resueltos en build: lo publicado desde la intranet (base compartida, ver supabase/web.sql)
// sobre src/data/config.json. Sin SUPABASE_URL / SUPABASE_ANON_KEY (p. ej. en local) se usa solo el JSON del repositorio.
import local from '../data/config.json';
import { leerConfigImobu } from './web-db.mjs';

export type Proyecto = (typeof local.proyectos)[number];
let config: typeof local = local;

try {
  const remoto = await leerConfigImobu({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY });
  if (remoto) config = { ...local, ...remoto } as typeof local;
} catch (e) {
  console.warn('[config] no se pudo leer la base compartida, se usa src/data/config.json');
}
export default config;
