import type { APIRoute } from 'astro';
import config from '../lib/config';

const paginas = ['', 'proyectos.html', 'evaluacion.html', 'broker.html', 'marcela/', 'legal.html']
  .concat(config.proyectos.filter((p) => !p.ejemplo).map((p) => `proyectos/${p.id}.html`));

export const GET: APIRoute = ({ site }) =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      paginas.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n') + '\n</urlset>\n',
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
