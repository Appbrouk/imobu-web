// Ejecutar: node --test test/formulario.test.mjs
// Comprueba que los clientes se reenvían a Brouk con token e idempotencia y que los brokers quedan solo en la base.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ALLOWED_ORIGINS = 'https://imobu.cl';
process.env.FORWARD_WEBHOOK_URL = 'https://brouk.test/api/leads';
process.env.FORWARD_WEBHOOK_TOKEN = 'tok';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';

const llamadas = [];
globalThis.fetch = async (url, opts) => { llamadas.push({ url, opts }); return { ok: true, json: async () => ({}) }; };
const { default: handler } = await import('../api/formulario.js');

function req(tipo, datos) {
  return { method: 'POST', headers: { origin: 'https://imobu.cl', 'content-type': 'application/json' }, socket: {}, body: { tipo, datos, pagina: 'x.html' } };
}
function res() {
  const r = { code: 0, setHeader() {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
}

test('cliente: va a la base y a Brouk con token e Idempotency-Key', async () => {
  llamadas.length = 0;
  const r = res();
  await handler(req('contacto', { nombre: 'Ana', telefono: '+56912345678', interes: 'Invertir', acepto: 'on', asesor: 'marcela-diaz' }), r);
  assert.equal(r.code, 200);
  const brouk = llamadas.find((l) => l.url === process.env.FORWARD_WEBHOOK_URL);
  assert.ok(brouk, 'no se reenvió a Brouk');
  assert.equal(brouk.opts.headers.Authorization, 'Bearer tok');
  assert.match(brouk.opts.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  const cuerpo = JSON.parse(brouk.opts.body);
  assert.equal(cuerpo.origen, 'imobu-web');
  assert.equal(cuerpo.asesor, 'marcela-diaz');
  const base = llamadas.find((l) => l.url.endsWith('/rest/v1/web_leads'));
  assert.ok(base, 'no se guardó en la base compartida');
  assert.equal(JSON.parse(base.opts.body).sitio, 'imobu');
});

test('broker: solo a la base, nunca a Brouk', async () => {
  llamadas.length = 0;
  const r = res();
  await handler(req('postulacion-broker', { nombre: 'Luis', telefono: '+56987654321', email: 'l@e.cl', comuna: 'Maipú', experiencia: '1 a 3 años', disponibilidad: 'Part time', acepto: 'on' }), r);
  assert.equal(r.code, 200);
  assert.ok(!llamadas.some((l) => l.url === process.env.FORWARD_WEBHOOK_URL), 'un broker se reenvió a Brouk');
  assert.ok(llamadas.some((l) => l.url.endsWith('/rest/v1/web_leads')));
});
