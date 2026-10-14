import type { APIRoute } from 'astro';
import config from '../../lib/config';

// Mismo contenido que tenía js/config.js, generado en build desde la configuración resuelta.
export const GET: APIRoute = () =>
  new Response(`var IMOBU_CONFIG = ${JSON.stringify(config).replace(/</g, '\\u003c')};`, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
  });
