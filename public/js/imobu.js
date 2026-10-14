// ─────────────────────────────────────────────────────────────
// IMOBU — utilidades compartidas por todas las páginas.
// Los PARÁMETROS (contacto, finanzas, proyectos, asesores…) viven en js/config.js
// y se editan desde intranet.html. Este archivo no necesita cambios para eso.
// Requiere cargar antes js/config.js.
// ─────────────────────────────────────────────────────────────
var IMOBU = (function () {
  // Carpeta raíz del sitio (permite usar el script desde subcarpetas, p. ej. /marcela/)
  var script = document.currentScript;
  var BASE = script ? script.src.replace(/js\/imobu\.js(\?.*)?$/, '') : '';

  // ── Configuración (con vista previa de cambios no publicados desde intranet.html) ──
  var C = window.IMOBU_CONFIG || {};
  var preview = false;
  try {
    if (/[?&]vista-previa=1\b/.test(location.search)) sessionStorage.setItem('imobu-preview', '1');
    if (/[?&]vista-previa=0\b/.test(location.search)) sessionStorage.removeItem('imobu-preview');
    if (sessionStorage.getItem('imobu-preview') === '1') {
      var borrador = localStorage.getItem('imobu-config-borrador');
      if (borrador) { C = JSON.parse(borrador); preview = true; }
    }
  } catch (e) { /* almacenamiento bloqueado: se usa config.js */ }

  var F = C.finanzas || {};
  var cfg = {
    UF: Number(F.uf) || 41065,
    TASA_ANUAL: (Number(F.tasaAnual) || 4.5) / 100,
    PLAZO_MESES: (Number(F.plazoAnos) || 25) * 12,
    PIE: (Number(F.piePct) || 20) / 100,
    DIV_MAX: (Number(F.dividendoMaxPct) || 25) / 100,
    CARGA_MAX: (Number(F.cargaMaxPct) || 45) / 100,
    RENTA_MIN: Number(F.rentaMinima) || 650000,
    COMISION: (Number((C.brokers || {}).comisionPct) || 1) / 100,
    WHATSAPP: String((C.sitio || {}).whatsapp || '56984336430').replace(/\D/g, '')
  };

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, C);
  }

  // ── Formato y cálculos ──
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function clp(n) { return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-CL'); }
  function uf(n) { return 'UF ' + Math.round(n).toLocaleString('es-CL'); }
  function tasaMensual(tasaAnual) { return Math.pow(1 + (tasaAnual == null ? cfg.TASA_ANUAL : tasaAnual), 1 / 12) - 1; }
  function cuotaUF(creditoUF, meses, tasaAnual) {
    var i = tasaMensual(tasaAnual), n = meses || cfg.PLAZO_MESES;
    return creditoUF * i / (1 - Math.pow(1 + i, -n));
  }
  function creditoDesdeDividendo(dividendoCLP, meses, tasaAnual) {
    var i = tasaMensual(tasaAnual), n = meses || cfg.PLAZO_MESES;
    return dividendoCLP * (1 - Math.pow(1 + i, -n)) / i / cfg.UF;
  }
  function dividendoCLP(precioUF, pie, meses, tasaAnual) {
    return cuotaUF(precioUF * (1 - (pie == null ? cfg.PIE : pie)), meses, tasaAnual) * cfg.UF;
  }
  function tipologia(d) {
    var label = function (n) { return n === 0 ? 'Studio' : n + 'D'; };
    return d.length === 1 ? label(d[0]) : label(d[0]) + ' a ' + label(d[d.length - 1]);
  }

  // ── Asesores: atribución de clientes que llegan desde la página de un asesor ──
  var asesores = C.asesores || [];
  function asesorPorId(id) { for (var k = 0; k < asesores.length; k++) if (asesores[k].id === id) return asesores[k]; return null; }
  var asesorId = null;
  (function () {
    var desdeUrl = new URLSearchParams(location.search).get('asesor');
    var desdePagina = document.body && document.body.getAttribute('data-asesor');
    var id = desdePagina || desdeUrl;
    try { if (!id) id = sessionStorage.getItem('imobu-asesor'); } catch (e) { /* sin almacenamiento */ }
    if (id && asesorPorId(id)) {
      asesorId = id;
      try { sessionStorage.setItem('imobu-asesor', id); } catch (e) { /* sin almacenamiento */ }
    }
  })();
  function conAsesor(href) { return asesorId ? href + (href.indexOf('?') >= 0 ? '&' : '?') + 'asesor=' + encodeURIComponent(asesorId) : href; }

  // ── Proyectos ──
  var proyectos = C.proyectos || [];
  function porId(id) { for (var k = 0; k < proyectos.length; k++) if (proyectos[k].id === id) return proyectos[k]; return null; }
  function foto(p, w) {
    return /^https?:\/\//.test(p.foto) ? p.foto : 'https://images.unsplash.com/' + p.foto + '?w=' + (w || 800) + '&q=80&auto=format&fit=crop';
  }
  function url(p) { return conAsesor(BASE + 'proyectos/' + encodeURIComponent(p.id) + '.html'); }
  function evalUrl(p) { return conAsesor(BASE + 'evaluacion.html' + (p ? '?proyecto=' + encodeURIComponent(p.nombre) : '')); }
  function wa(texto, numero) { return 'https://wa.me/' + (numero || cfg.WHATSAPP) + '?text=' + encodeURIComponent(texto); }

  var icons = {
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5E6166" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    bed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E6166" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="11" r="1.5"/></svg>',
    area: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E6166" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h5V4"/></svg>'
  };

  function card(p) {
    var entrega = p.entrega === 'inmediata';
    return '<article class="project">' +
      '<a class="project__media" href="' + esc(url(p)) + '" tabindex="-1" aria-hidden="true">' +
        '<img src="' + esc(foto(p, 800)) + '" loading="lazy" alt="">' +
        '<span class="badge' + (entrega ? ' badge--now' : '') + '">' + (entrega ? 'Entrega inmediata' : 'Entrega futura') + '</span>' +
      '</a>' +
      '<div class="project__body">' +
        '<div class="project__dev">' + esc(p.inmobiliaria) + '</div>' +
        '<h3><a href="' + esc(url(p)) + '">' + esc(p.nombre) + '</a></h3>' +
        '<p class="project__place">' + icons.pin + esc(p.comuna) + '</p>' +
        '<p class="project__specs"><span>' + icons.bed + tipologia(p.dorm || [1]) + '</span><span>' + icons.area + esc(p.m2) + '</span></p>' +
        '<div class="project__foot">' +
          '<div><div class="price-label">Desde</div><div class="price">' + uf(p.uf) + '</div></div>' +
          '<a href="' + esc(url(p)) + '" class="btn btn--primary btn--sm">Ver proyecto</a>' +
        '</div>' +
        '<div class="project__div">Dividendo referencial desde ' + clp(dividendoCLP(p.uf)) + ' al mes*</div>' +
      '</div>' +
    '</article>';
  }

  var notaDividendo = '*Dividendo referencial con ' + Math.round(cfg.PIE * 100) + '% de pie, tasa ' +
    (cfg.TASA_ANUAL * 100).toLocaleString('es-CL') + '% anual a ' + cfg.PLAZO_MESES / 12 +
    ' años, sin seguros, con UF de $' + cfg.UF.toLocaleString('es-CL') + '. No constituye oferta ni aprobación de crédito.';

  // ── Aplica los parámetros de config.js a la página ──
  function aplicarConfig(root) {
    root = root || document;
    root.querySelectorAll('[data-cfg]').forEach(function (el) {
      var v = get(el.getAttribute('data-cfg'));
      if (v != null && v !== '') el.textContent = v;
    });
    root.querySelectorAll('[data-cfg-href]').forEach(function (el) {
      var v = get(el.getAttribute('data-cfg-href'));
      if (v && /^https:\/\//.test(v)) el.href = v; else if (!v) el.hidden = true;
    });
    root.querySelectorAll('a[data-cfg-tel]').forEach(function (el) {
      var t = (C.sitio || {}).telefono;
      if (t) { el.href = 'tel:' + t.replace(/[^\d+]/g, ''); el.textContent = t; }
    });
    root.querySelectorAll('a[data-cfg-mail]').forEach(function (el) {
      var m = (C.sitio || {}).email;
      if (m) { el.href = 'mailto:' + m; el.textContent = m; }
    });
    // Todos los links de WhatsApp usan el número configurado (salvo los de un asesor)
    root.querySelectorAll('a[href^="https://wa.me/"]:not([data-wa-propio])').forEach(function (el) {
      el.href = el.getAttribute('href').replace(/wa\.me\/\d+/, 'wa.me/' + cfg.WHATSAPP);
    });
  }

  // ── Seguridad de formularios ──
  // Capa del navegador: trampa para bots (honeypot), tiempo mínimo de llenado, límite de envíos,
  // largos máximos, limpieza de texto y CAPTCHA opcional (Cloudflare Turnstile).
  // La protección definitiva está en el servidor: ver api/formulario.js y SEGURIDAD.md.
  var HONEYPOT = 'sitio_web_empresa';
  var MIN_MS = 3000;            // un humano no completa un formulario en menos de 3 s
  var LIMITE = 5, VENTANA_MS = 10 * 60 * 1000;   // máx. 5 envíos cada 10 minutos por navegador
  var MAX_LARGO = { text: 80, email: 120, tel: 20, url: 200, number: 6, textarea: 1000 };
  var turnstileKey = (C.formularios || {}).turnstileSiteKey || '';

  function proteger(form) {
    if (!form || form.dataset.protegido) return;
    form.dataset.protegido = '1';
    form.dataset.t0 = String(Date.now());
    var hp = document.createElement('div');
    hp.className = 'hp';
    hp.setAttribute('aria-hidden', 'true');
    hp.innerHTML = '<label>No completar este campo<input type="text" name="' + HONEYPOT + '" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(hp);
    form.querySelectorAll('input, textarea').forEach(function (f) {
      var tipo = f.tagName === 'TEXTAREA' ? 'textarea' : f.type;
      if (MAX_LARGO[tipo] && !f.hasAttribute('maxlength')) f.setAttribute('maxlength', MAX_LARGO[tipo]);
      if (tipo === 'tel' && !f.hasAttribute('pattern')) f.setAttribute('pattern', '\\+?[0-9\\s\\(\\)\\-]{8,20}');
    });
    if (turnstileKey) {
      var w = document.createElement('div');
      w.className = 'cf-turnstile full';
      w.setAttribute('data-sitekey', turnstileKey);
      w.setAttribute('data-language', 'es');
      var boton = form.querySelector('[type="submit"]');
      (boton ? boton.parentNode : form).insertBefore(w, boton);
      if (!document.getElementById('cf-turnstile-js')) {
        var s = document.createElement('script');
        s.id = 'cf-turnstile-js';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true; s.defer = true;
        document.head.appendChild(s);
      }
    }
  }

  function limpiar(v, max) {
    return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, max || 1000);
  }
  function telefonoValido(v) { var d = String(v).replace(/\D/g, ''); return d.length >= 8 && d.length <= 15; }

  function datosDe(form) {
    var datos = {};
    new FormData(form).forEach(function (v, k) {
      if (k === HONEYPOT || k === 'cf-turnstile-response') return;
      v = limpiar(v);
      if (k in datos) datos[k] = [].concat(datos[k], v); else datos[k] = v;
    });
    return datos;
  }

  function enviosRecientes() {
    try {
      var ahora = Date.now();
      return JSON.parse(localStorage.getItem('imobu-envios') || '[]').filter(function (t) { return ahora - t < VENTANA_MS; });
    } catch (e) { return []; }
  }

  // Envía un formulario ya validado. Resuelve { ok, demo } o rechaza con un Error de mensaje legible.
  function enviarFormulario(form, tipo, extra) {
    var boton = form.querySelector('[type="submit"]');
    var esBot = (form.elements[HONEYPOT] && form.elements[HONEYPOT].value) || (Date.now() - Number(form.dataset.t0 || 0) < MIN_MS);
    // A los bots se les responde "éxito" sin enviar nada, para no darles pistas
    if (esBot) return Promise.resolve({ ok: true, demo: true });
    var recientes = enviosRecientes();
    if (recientes.length >= LIMITE) return Promise.reject(new Error('Recibimos varios envíos seguidos desde este navegador. Espera unos minutos o escríbenos por WhatsApp.'));
    var token = form.elements['cf-turnstile-response'] ? form.elements['cf-turnstile-response'].value : '';
    if (turnstileKey && !token) return Promise.reject(new Error('Confirma la verificación de seguridad antes de enviar.'));

    var datos = datosDe(form);
    if (extra) Object.keys(extra).forEach(function (k) { datos[k] = extra[k]; });
    if (asesorId) datos.asesor = asesorId;
    var payload = { tipo: tipo, datos: datos, pagina: location.pathname.split('/').pop() || 'index.html', turnstileToken: token };

    var endpoint = (C.formularios || {}).endpoint || '';
    var registrar = function () {
      try { recientes.push(Date.now()); localStorage.setItem('imobu-envios', JSON.stringify(recientes)); } catch (e) { /* sin almacenamiento */ }
    };
    if (!endpoint) {
      // Modo demostración: aún no hay servidor configurado (ver SEGURIDAD.md)
      registrar();
      if (window.console) console.info('[IMOBU] Formulario "' + tipo + '" validado. Configura formularios.endpoint en intranet.html para recibirlo.');
      return Promise.resolve({ ok: true, demo: true });
    }
    var textoBoton = boton ? boton.textContent : '';
    if (boton) { boton.disabled = true; boton.textContent = 'Enviando…'; }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 429
        ? 'Recibimos varios envíos seguidos. Intenta de nuevo en unos minutos.'
        : 'No pudimos enviar tus datos. Intenta de nuevo o escríbenos por WhatsApp.');
      registrar();
      return { ok: true, demo: false };
    }, function () {
      throw new Error('No pudimos conectarnos. Revisa tu conexión o escríbenos por WhatsApp.');
    }).finally(function () {
      if (timer) clearTimeout(timer);
      if (boton) { boton.disabled = false; boton.textContent = textoBoton; }
      if (window.turnstile && turnstileKey) { try { window.turnstile.reset(); } catch (e) { /* widget no listo */ } }
    });
  }

  return {
    config: C, cfg: cfg, base: BASE, preview: preview, get: get,
    esc: esc, clp: clp, uf: uf, cuotaUF: cuotaUF, creditoDesdeDividendo: creditoDesdeDividendo,
    dividendoCLP: dividendoCLP, tipologia: tipologia, foto: foto, url: url, evalUrl: evalUrl, wa: wa,
    porId: porId, card: card, icons: icons, notaDividendo: notaDividendo,
    asesor: function () { return asesorId ? asesorPorId(asesorId) : null; }, asesorPorId: asesorPorId,
    aplicarConfig: aplicarConfig, proteger: proteger, limpiar: limpiar, telefonoValido: telefonoValido,
    enviarFormulario: enviarFormulario
  };
})();

// Compatibilidad: las páginas usan PROYECTOS directamente
var PROYECTOS = IMOBU.config.proyectos || [];

(function () {
  // Parámetros de config.js en la página
  IMOBU.aplicarConfig();

  // Todos los formularios de contacto quedan protegidos
  document.querySelectorAll('form[data-seguro]').forEach(IMOBU.proteger);

  // Aviso de vista previa (cambios hechos en intranet.html que aún no se publican)
  if (IMOBU.preview) {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:sticky;top:0;z-index:200;background:#9A6B00;color:#fff;font:600 13px/1.4 Montserrat,system-ui,sans-serif;padding:10px 16px;text-align:center';
    bar.innerHTML = 'Vista previa: estás viendo cambios sin publicar. <a href="?vista-previa=0" style="color:#fff;text-decoration:underline">Salir de la vista previa</a>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  // Menú móvil
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  if (!nav || !toggle) return;
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  nav.querySelectorAll('.nav__links a, .nav__cta').forEach(function (a) {
    a.addEventListener('click', function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();
