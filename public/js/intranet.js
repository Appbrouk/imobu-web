/* Intranet compartida de IMOBU (imobu.cl) y MD Invest (mdiaz.cl).
   Todo vive en la base compartida (ver supabase/web.sql):
     · web_proyectos  catálogo único; cada proyecto dice en qué webs se muestra
     · web_leads      formularios recibidos por ambas webs
     · web_sitios     parámetros de cada web (se editan como borrador y se publican con un botón)
     · web_historial  auditoría de cada cambio
   La seguridad la ponen el inicio de sesión (Supabase Auth) y las reglas RLS de la base:
   aunque alguien manipule esta página, sin ser administrador no puede escribir nada. */
(function () {
  var CX = window.IMOBU_CONEXION || {};
  var ONLINE = !!(CX.supabaseUrl && CX.supabaseAnonKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CX.supabaseUrl));
  var INACTIVIDAD_MS = 30 * 60 * 1000;
  var sb = null;

  var SITIOS = {
    imobu: { nombre: 'IMOBU', url: 'https://imobu.cl', pill: 'pill--imobu' },
    mdiaz: { nombre: 'MD Invest', url: 'https://mdiaz.cl', pill: 'pill--mdiaz' }
  };
  var IDS_SITIOS = ['imobu', 'mdiaz'];

  var PUB = {};        // parámetros publicados por sitio { imobu: {...}, mdiaz: {...} }
  var S = {};          // borrador por sitio
  var PROY = [];       // proyectos (todas las filas de web_proyectos)

  var $ = function (id) { return document.getElementById(id); };
  var copiar = function (o) { return JSON.parse(JSON.stringify(o)); };
  var igual = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  var get = function (sitio, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, S[sitio]); };
  var set = function (sitio, path, v) {
    var ks = path.split('.'), o = S[sitio];
    ks.slice(0, -1).forEach(function (k) { if (o[k] == null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = v;
  };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slug = function (t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^proyecto\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); };
  var fecha = function (iso) { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  var fotoUrl = function (f) { return !f ? '' : /^https?:\/\//.test(f) ? f : 'https://images.unsplash.com/' + f + '?w=200&q=60&auto=format&fit=crop'; };
  var ufFmt = function (n) { return 'UF ' + Math.round(Number(n) || 0).toLocaleString('es-CL'); };

  function vista(nombre) {
    ['login', 'clave', 'panel'].forEach(function (v) { $('vista-' + v).hidden = v !== nombre; });
  }
  function toast(t) {
    var el = $('toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3600);
  }
  function msg(id, texto) { var el = $(id); el.textContent = texto || ''; el.hidden = !texto; }
  function errorDe(r, accion) {
    if (!r || !r.error) return '';
    if (r.error.code === '42501') return 'Tu cuenta no tiene permiso para ' + (accion || 'hacer esto') + '.';
    if (r.error.code === '23505') return 'Ya existe un registro con ese identificador.';
    return 'No se pudo ' + (accion || 'guardar') + '. Revisa tu conexión o vuelve a ingresar.';
  }

  // ── Estado del borrador (parámetros de los sitios) ──
  function hayCambios() { return IDS_SITIOS.some(function (id) { return !igual(S[id], PUB[id]); }); }
  function guardarBorrador() {
    try {
      localStorage.setItem('web-intranet-borrador', JSON.stringify(S));
      // La vista previa de imobu.cl lee este borrador (js/imobu.js)
      localStorage.setItem('imobu-config-borrador', JSON.stringify(Object.assign({}, S.imobu, { proyectos: proyectosImobu() })));
    } catch (e) { /* sin almacenamiento */ }
    var cambios = hayCambios();
    var est = $('estado');
    est.textContent = cambios ? 'Parámetros sin publicar' : 'Publicado';
    est.className = 'adm-estado' + (cambios ? ' adm-estado--cambios' : ' adm-estado--ok');
  }

  // ════════════════════ PARÁMETROS DE CADA SITIO ════════════════════
  var FINANZAS = [
    ['finanzas.uf', 'Valor UF ($)', 'number', { min: 30000, max: 60000, step: 1 }],
    ['finanzas.tasaAnual', 'Tasa anual crédito (%)', 'number', { min: 1, max: 15, step: 0.01 }],
    ['finanzas.plazoAnos', 'Plazo del crédito (años)', 'number', { min: 5, max: 40, step: 1 }],
    ['finanzas.piePct', 'Pie (%)', 'number', { min: 5, max: 50, step: 1 }],
    ['finanzas.dividendoMaxPct', 'Dividendo máximo sobre la renta (%)', 'number', { min: 10, max: 50, step: 1 }],
    ['finanzas.cargaMaxPct', 'Carga financiera máxima (%)', 'number', { min: 20, max: 70, step: 1 }],
    ['finanzas.rentaMinima', 'Renta mínima referencial ($)', 'number', { min: 0, max: 5000000, step: 10000 }]
  ];
  var SECCIONES = {
    imobu: [
      { id: 'general', titulo: 'Contacto y redes', intro: 'Datos del pie de página, los botones de WhatsApp y los links a redes de todas las páginas de imobu.cl.', campos: [
        ['sitio.nombre', 'Nombre de la empresa', 'text'],
        ['sitio.telefono', 'Teléfono visible', 'text', { hint: 'Como se mostrará. Ej: +56 9 8433 6430' }],
        ['sitio.whatsapp', 'Número de WhatsApp', 'whatsapp', { hint: 'Solo números, con 56 al inicio. Ej: 56984336430' }],
        ['sitio.email', 'Correo de contacto', 'email'],
        ['sitio.direccion', 'Dirección', 'text'],
        ['sitio.horario', 'Horario de atención', 'text'],
        ['sitio.instagram', 'Instagram (URL)', 'url'],
        ['sitio.facebook', 'Facebook (URL)', 'url'],
        ['sitio.linkedin', 'LinkedIn (URL)', 'url']
      ] },
      { id: 'cifras', titulo: 'Cifras del inicio', intro: 'Los tres indicadores de confianza del home. Usa solo cifras reales y verificables.', campos: [
        ['cifras.experiencia', 'Años de experiencia', 'text', { hint: 'Ej: +8 años' }],
        ['cifras.inversionistas', 'Inversionistas asesorados', 'text', { hint: 'Ej: +450' }],
        ['cifras.inmobiliarias', 'Inmobiliarias aliadas', 'text', { hint: 'Ej: 12' }]
      ] },
      { id: 'finanzas', titulo: 'Supuestos financieros', intro: 'Se usan en el dividendo de las tarjetas, el simulador de cada proyecto y el pre-diagnóstico de la evaluación. Actualiza la UF y la tasa periódicamente.', campos: FINANZAS },
      { id: 'brokers', titulo: 'Programa Brokers', intro: 'Parámetros de la landing de brokers y su simulador de ingresos.', campos: [
        ['brokers.comisionPct', 'Comisión del broker sobre el valor de la unidad (%)', 'number', { min: 0.1, max: 10, step: 0.05, hint: 'Confirma este valor con el plan de comisiones real.' }],
        ['brokers.proximaGeneracion', 'Próxima generación (texto)', 'text', { hint: 'Ej: Lunes 2 de noviembre' }],
        ['brokers.duracionOnboarding', 'Duración del onboarding', 'text', { hint: 'Ej: 4 semanas' }]
      ] },
      { id: 'formularios', titulo: 'Formularios', intro: 'Dónde llegan los formularios de imobu.cl y la verificación anti-bots. Ver SEGURIDAD.md.', aviso: 'Aquí solo van datos PÚBLICOS. Nunca escribas contraseñas ni claves secretas: estos parámetros se publican en el sitio y cualquiera puede leerlos. Las claves secretas van en las variables de entorno del hosting.', campos: [
        ['formularios.endpoint', 'Dirección del receptor de formularios', 'endpoint', { hint: 'Normalmente /api/formulario. Vacío = modo demostración (no se envía nada).' }],
        ['formularios.turnstileSiteKey', 'Cloudflare Turnstile: clave del sitio (pública)', 'text', { hint: 'La "site key", NO la "secret key". Vacío = sin verificación anti-bots visible.' }]
      ] }
    ],
    mdiaz: [
      { id: 'general', titulo: 'Contacto y redes', intro: 'Datos de contacto y redes de mdiaz.cl. El WhatsApp se usa en todos los botones "Conversemos" y en la evaluación.', campos: [
        ['sitio.nombre', 'Nombre', 'text'],
        ['sitio.telefono', 'Teléfono visible', 'text'],
        ['sitio.whatsapp', 'Número de WhatsApp', 'whatsapp', { hint: 'Solo números, con 56 al inicio. Ej: 56951497482' }],
        ['sitio.email', 'Correo de contacto', 'email'],
        ['sitio.direccion', 'Dirección', 'text'],
        ['sitio.instagram', 'Instagram (URL)', 'url'],
        ['sitio.tiktok', 'TikTok (URL)', 'url'],
        ['sitio.linkedin', 'LinkedIn (URL)', 'url'],
        ['sitio.facebook', 'Facebook (URL)', 'url']
      ] },
      { id: 'finanzas', titulo: 'Supuestos financieros', intro: 'Se usan en el pre-diagnóstico del evaluador de mdiaz.cl. Conviene mantenerlos iguales a los de IMOBU.', campos: FINANZAS },
      { id: 'formularios', titulo: 'Formularios y HubSpot', intro: 'Los formularios de mdiaz.cl llegan a esta intranet (pestaña Formularios). El registro además se copia a HubSpot si está configurado.', aviso: 'Solo datos PÚBLICOS: el portal y el formulario de HubSpot van a la vista en cualquier formulario embebido. Nunca escribas claves secretas aquí.', campos: [
        ['formularios.turnstileSiteKey', 'Cloudflare Turnstile: clave del sitio (pública)', 'text', { hint: 'Vacío = sin verificación anti-bots visible.' }],
        ['hubspot.portalId', 'HubSpot: Portal ID', 'text', { hint: 'Vacío = no se copia a HubSpot.' }],
        ['hubspot.formGuid', 'HubSpot: ID del formulario', 'text'],
        ['hubspot.region', 'HubSpot: región', 'text', { hint: 'na1 (por defecto) o eu1' }]
      ] }
    ]
  };

  var VALIDA = {
    url: function (v) { return !v || /^https:\/\/[^\s<>"]+$/.test(v) ? '' : 'Debe comenzar con https://'; },
    email: function (v) { return !v || /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(v) ? '' : 'Correo no válido'; },
    whatsapp: function (v) { return /^56\d{8,9}$/.test(v) ? '' : 'Solo números, comenzando con 56 (ej: 56984336430)'; },
    endpoint: function (v) { return !v || /^\/[a-z0-9/_-]*$/i.test(v) || /^https:\/\/[^\s<>"]+$/.test(v) ? '' : 'Usa una ruta como /api/formulario o una URL https://'; },
    text: function (v) { return /[<>]/.test(v) ? 'No uses los caracteres < >' : ''; }
  };

  function campoHTML(sitio, c) {
    var ruta = c[0], label = c[1], tipo = c[2], o = c[3] || {};
    var v = get(sitio, ruta);
    var inputType = tipo === 'number' ? 'number' : tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : 'text';
    var attrs = tipo === 'number' ? ' min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" inputmode="decimal"' : ' maxlength="200"';
    return '<label class="field" data-sitio="' + sitio + '" data-ruta="' + ruta + '" data-tipo="' + tipo + '">' + esc(label) +
      '<input type="' + inputType + '"' + attrs + ' value="' + esc(v == null ? '' : v) + '">' +
      (o.hint ? '<span class="adm-hint">' + esc(o.hint) + '</span>' : '') +
      '<span class="adm-error" hidden></span></label>';
  }
  function validarCampo(label) {
    var tipo = label.getAttribute('data-tipo');
    var input = label.querySelector('input');
    var v = input.value.trim(), m = '';
    if (tipo === 'number') {
      var n = Number(v);
      if (v === '' || isNaN(n) || n < Number(input.min) || n > Number(input.max)) m = 'Valor entre ' + input.min + ' y ' + input.max;
    } else if (VALIDA[tipo]) m = VALIDA[tipo](v);
    if (!m && tipo !== 'number' && VALIDA.text(v)) m = VALIDA.text(v);
    label.classList.toggle('is-bad', !!m);
    var e = label.querySelector('.adm-error');
    e.textContent = m; e.hidden = !m;
    return { ok: !m, valor: tipo === 'number' ? Number(v) : v };
  }
  function alEditar(e) {
    var label = e.target.closest('[data-ruta]');
    if (!label) return;
    var r = validarCampo(label);
    if (r.ok) { set(label.getAttribute('data-sitio'), label.getAttribute('data-ruta'), r.valor); guardarBorrador(); }
  }

  // ── Asesores (IMOBU) ──
  var CAMPOS_ASESOR = [
    ['nombre', 'Nombre', 'text'], ['cargo', 'Cargo', 'text'], ['whatsapp', 'WhatsApp', 'whatsapp'], ['telefono', 'Teléfono visible', 'text'],
    ['instagram', 'Instagram (URL)', 'url'], ['tiktok', 'TikTok (URL)', 'url'], ['linkedin', 'LinkedIn (URL)', 'url'], ['facebook', 'Facebook (URL)', 'url'],
    ['foto', 'Foto principal (URL)', 'url'], ['fotoTrabajo', 'Foto trabajando (URL)', 'url'], ['fotoLlamada', 'Foto en llamada (URL)', 'url']
  ];
  function asesoresHTML() {
    return '<h3 style="margin-top: 28px">Asesores</h3><p style="color: var(--muted); font-size: 14px; margin: 6px 0 16px">Datos de las páginas personales de los asesores (por ejemplo imobu.cl/marcela/). Los clientes que llegan desde esas páginas quedan atribuidos al asesor.</p>' +
      (S.imobu.asesores || []).map(function (a, i) {
        return '<div class="asesor-card"><div class="asesor-card__head"><strong>' + esc(a.nombre) + '</strong> <span class="adm-hint">· id: ' + esc(a.id) + '</span></div>' +
          '<div class="adm-grid">' + CAMPOS_ASESOR.map(function (c) { return campoHTML('imobu', ['asesores.' + i + '.' + c[0], c[1], c[2]]); }).join('') + '</div></div>';
      }).join('');
  }

  // ════════════════════ PANEL ════════════════════
  var tabs = $('tabs'), paneles = $('paneles');
  var construido = false;
  function construir() {
    if (construido) return;
    construido = true;
    var todas = [
      { id: 'proyectos', titulo: 'Proyectos' }, { id: 'leads', titulo: 'Formularios' },
      { id: 'imobu', titulo: 'Web IMOBU' }, { id: 'mdiaz', titulo: 'Web MD Invest' },
      { id: 'historial', titulo: 'Historial' }, { id: 'respaldo', titulo: 'Respaldo' }
    ];
    todas.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'tab-' + s.id;
      b.setAttribute('aria-controls', 'panel-' + s.id);
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      b.textContent = s.titulo;
      b.addEventListener('click', function () { mostrar(s.id); });
      tabs.appendChild(b);
    });
    construirProyectos();
    construirLeads();
    IDS_SITIOS.forEach(function (id) {
      var p = nuevoPanel(id);
      p.addEventListener('input', alEditar);
    });
    pintarSitios();
    construirHistorial();
    construirRespaldo();
    mostrar('proyectos');
  }
  function nuevoPanel(id) {
    var p = document.createElement('section');
    p.className = 'adm-panel'; p.id = 'panel-' + id; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tab-' + id);
    paneles.appendChild(p);
    return p;
  }
  function mostrar(id) {
    tabs.querySelectorAll('[role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', b.id === 'tab-' + id ? 'true' : 'false'); });
    paneles.querySelectorAll('.adm-panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + id; });
    if (id === 'historial') cargarHistorial();
    if (id === 'leads') cargarLeads();
  }
  function pintarSitios() {
    IDS_SITIOS.forEach(function (id) {
      var p = $('panel-' + id);
      p.innerHTML = '<h2>Parámetros de ' + esc(SITIOS[id].nombre) + '</h2><p>Se editan como borrador y se publican con <strong>Guardar y publicar</strong>. Sitio: <a href="' + SITIOS[id].url + '" target="_blank" rel="noopener">' + esc(SITIOS[id].url) + '</a></p>' +
        SECCIONES[id].map(function (s) {
          return '<h3 style="margin-top: 28px">' + esc(s.titulo) + '</h3><p style="color: var(--muted); font-size: 14px; margin: 6px 0 16px">' + esc(s.intro) + '</p>' +
            (s.aviso ? '<div class="adm-warn">' + esc(s.aviso) + '</div>' : '') +
            '<div class="adm-grid">' + s.campos.map(function (c) { return campoHTML(id, c); }).join('') + '</div>';
        }).join('') +
        (id === 'imobu' ? asesoresHTML() : '');
      p.querySelectorAll('[data-ruta]').forEach(validarCampo);
    });
    guardarBorrador();
  }

  // ════════════════════ PROYECTOS (web_proyectos) ════════════════════
  var editId = null;
  function proyectosImobu() {
    // Forma que usa imobu.cl (para la vista previa)
    return PROY.filter(function (p) { return p.activo && p.sitios.indexOf('imobu') >= 0; }).map(function (p) {
      var f = (p.fotos || [])[0] || {};
      return { id: p.id, nombre: p.nombre, inmobiliaria: p.inmobiliaria, comuna: p.comuna, uf: Number(p.uf), entrega: p.entrega, dorm: p.dorm, m2: p.m2, destacado: p.destacado, ejemplo: p.ejemplo, foto: f.src || '', alt: f.alt || '' };
    });
  }
  function cargarProyectos() {
    return sb.from('web_proyectos').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true }).then(function (r) {
      if (r.error) { toast(errorDe(r, 'cargar los proyectos')); return; }
      PROY = r.data || [];
      listarProyectos();
      guardarBorrador();
    });
  }
  function construirProyectos() {
    var p = nuevoPanel('proyectos');
    p.innerHTML = '<h2>Proyectos</h2><p>Catálogo único de ambas webs: cada proyecto dice en qué sitios se muestra. Los cambios se guardan al instante en la base; imobu.cl se regenera sola en 1 a 2 minutos y mdiaz.cl los muestra en menos de un minuto. Usa ↑ ↓ para ordenar.</p>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th></th><th>Proyecto</th><th class="col-ocultable">Comuna</th><th>Desde</th><th>Webs</th><th></th></tr></thead><tbody id="proy-list"><tr><td colspan="6">Cargando…</td></tr></tbody></table></div>' +
      '<button type="button" class="btn btn--primary btn--sm" id="proy-nuevo" style="margin-top: 16px">+ Agregar proyecto</button>' +
      '<form class="editor" id="proy-editor" hidden novalidate>' +
        '<h3 id="proy-editor-titulo">Editar proyecto</h3>' +
        '<div class="adm-grid">' +
          '<label class="field">Nombre<input name="nombre" maxlength="80" required></label>' +
          '<label class="field">Identificador para la URL<input name="id" maxlength="60" pattern="[a-z0-9][a-z0-9\\-]*" required><span class="adm-hint">Solo minúsculas, números y guiones. No se puede cambiar después de crear el proyecto.</span></label>' +
          '<label class="field">Inmobiliaria<input name="inmobiliaria" maxlength="80" required></label>' +
          '<label class="field">Comuna<input name="comuna" maxlength="80" required></label>' +
          '<label class="field">Precio desde (UF)<input name="uf" type="number" min="300" max="100000" step="1" required></label>' +
          '<label class="field">Entrega<select name="entrega"><option value="inmediata">Inmediata</option><option value="futura">Futura</option></select></label>' +
          '<label class="field">Superficies<input name="m2" maxlength="40" placeholder="Ej: 30 a 55 m²" required></label>' +
          '<label class="field">Etiqueta (opcional)<input name="etiqueta" maxlength="40" placeholder="Ej: Últimas unidades"><span class="adm-hint">Texto corto en la tarjeta de mdiaz.cl. Vacío = "Entrega inmediata" o "Entrega futura".</span></label>' +
          '<fieldset class="choice-group full"><legend>Tipologías</legend><div class="dorms">' +
            [0, 1, 2, 3, 4].map(function (d) { return '<label class="choice"><input type="checkbox" name="dorm" value="' + d + '"><span>' + (d === 0 ? 'Studio' : d + 'D') + '</span></label>'; }).join('') +
          '</div></fieldset>' +
          '<label class="field full">Resumen (una frase para la tarjeta)<input name="resumen" maxlength="300"></label>' +
          '<label class="field full">Descripción de la ficha<textarea name="descripcion" maxlength="4000" placeholder="Uno o más párrafos, separados por una línea en blanco"></textarea></label>' +
          '<label class="field full">Datos de la ficha<textarea name="datos" maxlength="2000" placeholder="Una línea por dato, con dos puntos. Ej:&#10;Dirección: Froilán Roa 1201, La Florida&#10;Metro: Vicuña Mackenna L4"></textarea></label>' +
          '<label class="field full">Fotos<div class="editor__foto"><img id="proy-foto-prev" alt=""><textarea name="fotos" maxlength="3000" style="flex: 1; min-height: 80px" placeholder="Una por línea: URL https (o ID de Unsplash photo-…) | descripción para accesibilidad&#10;La primera es la portada." required></textarea></div><span class="adm-hint">Idealmente sube la foto real al sitio y escribe su URL completa (https://…).</span></label>' +
          '<label class="field">Ficha de la inmobiliaria (URL, solo referencia interna)<input name="enlace" type="url" maxlength="300" placeholder="https://"><span class="adm-hint">No se muestra en ninguna web: los proyectos se venden por nuestros medios.</span></label>' +
          '<fieldset class="choice-group"><legend>Mostrar en</legend><div class="dorms">' +
            IDS_SITIOS.map(function (id) { return '<label class="choice"><input type="checkbox" name="sitios" value="' + id + '"><span>' + esc(SITIOS[id].nombre) + '</span></label>'; }).join('') +
          '</div></fieldset>' +
          '<label class="check"><input type="checkbox" name="destacado"><span>Destacado en el inicio de IMOBU</span></label>' +
          '<label class="check"><input type="checkbox" name="ejemplo"><span>Es un proyecto de ejemplo (no real)</span></label>' +
          '<label class="check"><input type="checkbox" name="activo" checked><span>Activo (visible en las webs marcadas)</span></label>' +
        '</div>' +
        '<p class="form-error" id="proy-error" hidden style="margin-top: 14px"></p>' +
        '<div class="actions" style="margin-top: 20px"><button type="submit" class="btn btn--primary btn--sm" id="proy-guardar">Guardar en la base</button><button type="button" class="btn btn--outline btn--sm" id="proy-cancelar">Cancelar</button></div>' +
      '</form>';

    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-acc]');
      if (!b) return;
      var id = b.getAttribute('data-id'), acc = b.getAttribute('data-acc');
      var i = PROY.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      if (acc === 'editar') return abrirEditor(id);
      if (acc === 'borrar') return borrarProyecto(PROY[i]);
      if (acc === 'subir' && i > 0) return intercambiar(PROY[i], PROY[i - 1]);
      if (acc === 'bajar' && i < PROY.length - 1) return intercambiar(PROY[i], PROY[i + 1]);
    });
    $('proy-nuevo').addEventListener('click', function () { abrirEditor(null); });
    $('proy-cancelar').addEventListener('click', function () { $('proy-editor').hidden = true; });
    var ed = $('proy-editor');
    ed.elements.nombre.addEventListener('input', function () { if (editId == null) ed.elements.id.value = slug(this.value); });
    ed.elements.fotos.addEventListener('input', function () { var f = parsearFotos(this.value)[0]; $('proy-foto-prev').src = f ? fotoUrl(f.src) : ''; });
    ed.addEventListener('submit', guardarProyecto);
  }
  function pillsSitios(p) {
    var h = p.sitios.map(function (s) { return SITIOS[s] ? '<span class="pill ' + SITIOS[s].pill + '">' + esc(SITIOS[s].nombre) + '</span>' : ''; }).join('');
    if (!p.activo) h += '<span class="pill pill--oculto">Oculto</span>';
    if (p.destacado) h += '<span class="pill pill--dest">Destacado</span>';
    if (p.ejemplo) h += '<span class="pill pill--ejemplo">Ejemplo</span>';
    return '<div class="sitios-pills">' + (h || '<span class="pill pill--oculto">En ninguna web</span>') + '</div>';
  }
  function listarProyectos() {
    var tb = $('proy-list');
    tb.innerHTML = PROY.length ? PROY.map(function (p) {
      var f = (p.fotos || [])[0] || {};
      return '<tr><td><img src="' + esc(fotoUrl(f.src)) + '" alt=""></td>' +
        '<td><strong>' + esc(p.nombre) + '</strong><br><span class="adm-hint">' + esc(p.inmobiliaria) + ' · ' + esc(p.id) + '</span></td>' +
        '<td class="col-ocultable">' + esc(p.comuna) + '</td><td>' + ufFmt(p.uf) + '</td>' +
        '<td>' + pillsSitios(p) + '</td>' +
        '<td><div class="acciones">' +
          '<button type="button" class="mini-btn" data-acc="subir" data-id="' + esc(p.id) + '" aria-label="Subir ' + esc(p.nombre) + '">↑</button>' +
          '<button type="button" class="mini-btn" data-acc="bajar" data-id="' + esc(p.id) + '" aria-label="Bajar ' + esc(p.nombre) + '">↓</button>' +
          '<button type="button" class="mini-btn" data-acc="editar" data-id="' + esc(p.id) + '">Editar</button>' +
          '<button type="button" class="mini-btn mini-btn--peligro" data-acc="borrar" data-id="' + esc(p.id) + '">Eliminar</button>' +
        '</div></td></tr>';
    }).join('') : '<tr><td colspan="6">Aún no hay proyectos. Agrega el primero con el botón de abajo.</td></tr>';
  }
  function parsearFotos(texto) {
    return String(texto).split('\n').map(function (l) {
      var partes = l.split('|'), src = (partes[0] || '').trim();
      return src ? { src: src, alt: (partes.slice(1).join('|') || '').trim() } : null;
    }).filter(Boolean);
  }
  function parsearDatos(texto) {
    return String(texto).split('\n').map(function (l) {
      var i = l.indexOf(':');
      if (i < 1) return null;
      var k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
      return k && v ? [k, v] : null;
    }).filter(Boolean);
  }
  function abrirEditor(id) {
    editId = id;
    var f = $('proy-editor');
    var p = id != null ? PROY.find(function (x) { return x.id === id; }) : {
      nombre: '', id: '', inmobiliaria: '', comuna: '', uf: '', entrega: 'inmediata', dorm: [1, 2], m2: '', etiqueta: '', resumen: '',
      descripcion: [], datos: [], fotos: [], enlace: '', sitios: ['imobu', 'mdiaz'], destacado: false, ejemplo: false, activo: true
    };
    $('proy-editor-titulo').textContent = id != null ? 'Editar: ' + p.nombre : 'Nuevo proyecto';
    ['nombre', 'id', 'inmobiliaria', 'comuna', 'uf', 'entrega', 'm2', 'etiqueta', 'resumen', 'enlace'].forEach(function (k) { f.elements[k].value = p[k] == null ? '' : p[k]; });
    f.elements.id.readOnly = id != null;
    f.elements.descripcion.value = (p.descripcion || []).join('\n\n');
    f.elements.datos.value = (p.datos || []).map(function (d) { return d[0] + ': ' + d[1]; }).join('\n');
    f.elements.fotos.value = (p.fotos || []).map(function (x) { return x.src + (x.alt ? ' | ' + x.alt : ''); }).join('\n');
    f.querySelectorAll('input[name="dorm"]').forEach(function (c) { c.checked = (p.dorm || []).indexOf(Number(c.value)) >= 0; });
    f.querySelectorAll('input[name="sitios"]').forEach(function (c) { c.checked = (p.sitios || []).indexOf(c.value) >= 0; });
    f.elements.destacado.checked = !!p.destacado;
    f.elements.ejemplo.checked = !!p.ejemplo;
    f.elements.activo.checked = p.activo !== false;
    var f0 = (p.fotos || [])[0];
    $('proy-foto-prev').src = f0 ? fotoUrl(f0.src) : '';
    $('proy-error').hidden = true;
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    f.elements.nombre.focus({ preventScroll: true });
  }
  function guardarProyecto(e) {
    e.preventDefault();
    var f = $('proy-editor'), m = '';
    var marcados = function (name) { return Array.prototype.filter.call(f.querySelectorAll('input[name="' + name + '"]'), function (c) { return c.checked; }).map(function (c) { return c.value; }); };
    var dorm = marcados('dorm').map(Number), sitios = marcados('sitios');
    var fotos = parsearFotos(f.elements.fotos.value);
    var textos = ['nombre', 'inmobiliaria', 'comuna', 'm2', 'etiqueta', 'resumen', 'descripcion', 'datos'].map(function (k) { return f.elements[k].value; }).join('');
    var bad = Array.prototype.find.call(f.querySelectorAll('[required]'), function (x) { return !x.checkValidity(); });
    if (bad) m = 'Revisa el campo "' + bad.closest('label').firstChild.textContent.trim() + '".';
    else if (!dorm.length) m = 'Marca al menos una tipología.';
    else if (!fotos.length || fotos.some(function (x) { return !/^photo-[\w-]+$/.test(x.src) && !/^https:\/\/[^\s<>"]+$/.test(x.src); })) m = 'Cada foto debe ser un ID de Unsplash (photo-…) o una URL que comience con https://';
    else if (f.elements.enlace.value && !/^https:\/\/[^\s<>"]+$/.test(f.elements.enlace.value.trim())) m = 'La ficha externa debe comenzar con https://';
    else if (/[<>]/.test(textos)) m = 'No uses los caracteres < >';
    else if (editId == null && PROY.some(function (p) { return p.id === f.elements.id.value; })) m = 'Ya existe un proyecto con ese identificador.';
    if (m) { $('proy-error').textContent = m; $('proy-error').hidden = false; return; }
    var fila = {
      id: f.elements.id.value, nombre: f.elements.nombre.value.trim(), inmobiliaria: f.elements.inmobiliaria.value.trim(),
      comuna: f.elements.comuna.value.trim(), uf: Number(f.elements.uf.value), entrega: f.elements.entrega.value, dorm: dorm,
      m2: f.elements.m2.value.trim(), etiqueta: f.elements.etiqueta.value.trim(), resumen: f.elements.resumen.value.trim(),
      descripcion: f.elements.descripcion.value.split(/\n\s*\n/).map(function (t) { return t.replace(/\s+/g, ' ').trim(); }).filter(Boolean),
      datos: parsearDatos(f.elements.datos.value), fotos: fotos, enlace: f.elements.enlace.value.trim(), sitios: sitios,
      destacado: f.elements.destacado.checked, ejemplo: f.elements.ejemplo.checked, activo: f.elements.activo.checked,
      orden: editId != null ? PROY.find(function (p) { return p.id === editId; }).orden : PROY.reduce(function (mx, p) { return Math.max(mx, p.orden); }, -1) + 1
    };
    var b = $('proy-guardar'); b.disabled = true; b.textContent = 'Guardando…';
    sb.from('web_proyectos').upsert(fila).then(function (r) {
      b.disabled = false; b.textContent = 'Guardar en la base';
      if (r.error) { $('proy-error').textContent = errorDe(r, 'guardar el proyecto'); $('proy-error').hidden = false; return; }
      f.hidden = true;
      toast('Proyecto guardado');
      pedirRebuild();
      return cargarProyectos();
    });
  }
  function borrarProyecto(p) {
    if (!confirm('¿Eliminar "' + p.nombre + '" de ambas webs? Si solo quieres ocultarlo, edítalo y desmarca "Activo".')) return;
    sb.from('web_proyectos').delete().eq('id', p.id).then(function (r) {
      if (r.error) return toast(errorDe(r, 'eliminar el proyecto'));
      toast('Proyecto eliminado');
      pedirRebuild();
      cargarProyectos();
    });
  }
  function intercambiar(a, b) {
    var oa = a.orden, ob = b.orden;
    if (oa === ob) { ob = oa + 1; }
    Promise.all([
      sb.from('web_proyectos').update({ orden: ob }).eq('id', a.id),
      sb.from('web_proyectos').update({ orden: oa }).eq('id', b.id)
    ]).then(function (rs) {
      var err = rs.find(function (r) { return r.error; });
      if (err) return toast(errorDe(err, 'reordenar'));
      pedirRebuild();
      cargarProyectos();
    });
  }

  // ════════════════════ FORMULARIOS (web_leads) ════════════════════
  var ESTADOS = ['Nuevo', 'Contactado', 'Reunion', 'Entrevista', 'Aceptado', 'Cliente', 'Activo', 'Descartado'];
  var LEADS = [];
  var TIPOS = { contacto: 'Contacto', evaluacion: 'Evaluación', registro: 'Registro', 'registro-asesor': 'Registro asesor', 'postulacion-broker': 'Postulación broker' };
  function construirLeads() {
    var p = nuevoPanel('leads');
    p.innerHTML = '<h2>Formularios recibidos</h2><p>Todo lo que llega desde imobu.cl y mdiaz.cl: contactos, evaluaciones de perfil, registros y postulantes a broker. Cambia el estado y escribe notas; se guardan solos.</p>' +
      '<div class="adm-filtros">' +
        '<label class="field">Web<select id="lead-f-sitio"><option value="">Todas</option>' + IDS_SITIOS.map(function (id) { return '<option value="' + id + '">' + esc(SITIOS[id].nombre) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">Tipo<select id="lead-f-tipo"><option value="">Todos</option></select></label>' +
        '<label class="field">Estado<select id="lead-f-estado"><option value="">Todos</option>' + ESTADOS.map(function (e) { return '<option>' + e + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="btn btn--outline btn--sm" id="lead-recargar">Actualizar</button>' +
      '</div>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th>Fecha</th><th>Web · Tipo</th><th>Persona</th><th class="col-ocultable">Resumen</th><th>Estado</th><th class="col-ocultable">Notas</th><th></th></tr></thead><tbody id="lead-list"><tr><td colspan="7">Cargando…</td></tr></tbody></table></div>';
    p.addEventListener('change', function (e) {
      if (e.target.closest('.adm-filtros')) return listarLeads();
      var el = e.target.closest('[data-lead]');
      if (!el) return;
      var cambio = {};
      cambio[el.getAttribute('data-campo')] = el.value.trim();
      sb.from('web_leads').update(cambio).eq('id', Number(el.getAttribute('data-lead'))).then(function (r) {
        toast(r.error ? errorDe(r, 'guardar el cambio') : 'Guardado');
      });
    });
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ver]');
      if (!b) return;
      var tr = $('lead-det-' + b.getAttribute('data-ver'));
      tr.hidden = !tr.hidden;
      b.textContent = tr.hidden ? 'Ver' : 'Cerrar';
    });
    $('lead-recargar').addEventListener('click', cargarLeads);
  }
  function cargarLeads() {
    if (!sb) return;
    sb.from('web_leads').select('id, recibido, sitio, tipo, pagina, asesor, estado, notas, datos').order('id', { ascending: false }).limit(300).then(function (r) {
      if (r.error) { $('lead-list').innerHTML = '<tr><td colspan="7">No se pudieron cargar los formularios.</td></tr>'; return; }
      LEADS = r.data || [];
      var sel = $('lead-f-tipo'), actual = sel.value;
      var tipos = LEADS.map(function (l) { return l.tipo; }).filter(function (t, i, a) { return a.indexOf(t) === i; }).sort();
      sel.innerHTML = '<option value="">Todos</option>' + tipos.map(function (t) { return '<option value="' + esc(t) + '"' + (t === actual ? ' selected' : '') + '>' + esc(TIPOS[t] || t) + '</option>'; }).join('');
      listarLeads();
    });
  }
  function resumenLead(l) {
    var d = l.datos || {}, partes = [];
    if (d.interes) partes.push(d.interes);
    if (d.prediagnostico && d.prediagnostico.status) partes.push('Pre-diagnóstico: ' + d.prediagnostico.status + (d.prediagnostico.precioUF ? ' · hasta ' + ufFmt(d.prediagnostico.precioUF) : ''));
    if (d.proyecto) partes.push('Proyecto: ' + d.proyecto);
    if (d.comuna && l.tipo === 'postulacion-broker') partes.push([d.comuna, d.experiencia, d.disponibilidad].filter(Boolean).join(' · '));
    if (d.renta && !d.prediagnostico) partes.push('Renta ' + d.renta);
    if (l.asesor) partes.push('Asesor: ' + l.asesor);
    return partes.join(' · ');
  }
  function listarLeads() {
    var fs = $('lead-f-sitio').value, ft = $('lead-f-tipo').value, fe = $('lead-f-estado').value;
    var lista = LEADS.filter(function (l) { return (!fs || l.sitio === fs) && (!ft || l.tipo === ft) && (!fe || l.estado === fe); });
    var tb = $('lead-list');
    tb.innerHTML = lista.length ? lista.map(function (l) {
      var d = l.datos || {};
      var nombre = [d.nombre, d.apellido].filter(Boolean).join(' ') || '—';
      var detalle = Object.keys(d).map(function (k) {
        var v = d[k];
        return '<dt>' + esc(k) + '</dt><dd>' + esc(typeof v === 'object' ? JSON.stringify(v) : v) + '</dd>';
      }).join('');
      return '<tr><td>' + esc(fecha(l.recibido)) + '</td>' +
        '<td><span class="pill ' + (SITIOS[l.sitio] ? SITIOS[l.sitio].pill : '') + '">' + esc(SITIOS[l.sitio] ? SITIOS[l.sitio].nombre : l.sitio) + '</span><br><span class="adm-hint">' + esc(TIPOS[l.tipo] || l.tipo) + (l.pagina ? ' · ' + esc(l.pagina) : '') + '</span></td>' +
        '<td><strong>' + esc(nombre) + '</strong><br><span class="adm-hint">' + esc(d.telefono || '') + (d.email ? ' · ' + esc(d.email) : '') + '</span></td>' +
        '<td class="col-ocultable">' + esc(resumenLead(l)) + '</td>' +
        '<td><select data-lead="' + l.id + '" data-campo="estado">' + ESTADOS.map(function (e) { return '<option' + (e === l.estado ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></td>' +
        '<td class="col-ocultable"><input type="text" data-lead="' + l.id + '" data-campo="notas" maxlength="1000" value="' + esc(l.notas || '') + '" placeholder="Notas"></td>' +
        '<td><button type="button" class="mini-btn" data-ver="' + l.id + '">Ver</button></td></tr>' +
        '<tr id="lead-det-' + l.id + '" hidden><td colspan="7"><div class="lead-detalle"><dl>' + detalle + '</dl></div></td></tr>';
    }).join('') : '<tr><td colspan="7">No hay formularios con esos filtros.</td></tr>';
  }

  // ════════════════════ HISTORIAL (web_historial) ════════════════════
  function construirHistorial() {
    var p = nuevoPanel('historial');
    p.innerHTML = '<h2>Historial de cambios</h2><p>Cada cambio en proyectos y parámetros queda registrado con su autor. Puedes restaurar una versión anterior: un proyecto vuelve a la base tal como estaba; los parámetros de una web se cargan como borrador para revisarlos y publicarlos.</p>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th>Fecha</th><th>Qué</th><th class="col-ocultable">Acción</th><th>Por</th><th></th></tr></thead><tbody id="hist-list"><tr><td colspan="5">Cargando…</td></tr></tbody></table></div>';
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hist]');
      if (!b) return;
      sb.from('web_historial').select('tabla, clave, data').eq('id', Number(b.getAttribute('data-hist'))).single().then(function (r) {
        if (r.error || !r.data || !r.data.data) return toast('No se pudo cargar esa versión');
        var h = r.data;
        if (h.tabla === 'web_sitios') {
          if (!SITIOS[h.clave]) return toast('Sitio desconocido');
          S[h.clave] = h.data.config || {};
          pintarSitios(); mostrar(h.clave);
          toast('Versión cargada como borrador. Revisa y presiona "Guardar y publicar".');
          return;
        }
        if (h.tabla === 'web_proyectos') {
          if (!confirm('¿Restaurar el proyecto "' + (h.data.nombre || h.clave) + '" tal como estaba en esa fecha?')) return;
          var fila = copiar(h.data);
          delete fila.creado; delete fila.actualizado; delete fila.actualizado_por;
          sb.from('web_proyectos').upsert(fila).then(function (q) {
            if (q.error) return toast(errorDe(q, 'restaurar el proyecto'));
            toast('Proyecto restaurado'); pedirRebuild(); cargarProyectos(); cargarHistorial();
          });
        }
      });
    });
  }
  function cargarHistorial() {
    if (!sb) return;
    sb.from('web_historial').select('id, tabla, clave, accion, cambiado, cambiado_por').order('id', { ascending: false }).limit(60).then(function (r) {
      var tb = $('hist-list');
      if (r.error) { tb.innerHTML = '<tr><td colspan="5">No se pudo cargar el historial.</td></tr>'; return; }
      var ACC = { insert: 'Creado', update: 'Modificado', delete: 'Eliminado' };
      tb.innerHTML = r.data.length ? r.data.map(function (h) {
        var que = h.tabla === 'web_sitios' ? 'Parámetros de ' + (SITIOS[h.clave] ? SITIOS[h.clave].nombre : h.clave) : 'Proyecto ' + h.clave;
        return '<tr><td>' + esc(fecha(h.cambiado)) + '</td><td>' + esc(que) + '</td><td class="col-ocultable">' + esc(ACC[h.accion] || h.accion) + '</td><td>' + esc(h.cambiado_por || '—') + '</td>' +
          '<td><div class="acciones"><button type="button" class="mini-btn" data-hist="' + h.id + '">Restaurar</button></div></td></tr>';
      }).join('') : '<tr><td colspan="5">Aún no hay cambios registrados.</td></tr>';
    });
  }

  // ════════════════════ RESPALDO ════════════════════
  function construirRespaldo() {
    var p = nuevoPanel('respaldo');
    p.innerHTML = '<h2>Respaldo</h2><p>Descarga una copia de los proyectos y los parámetros de ambas webs (JSON). Guárdala antes de hacer cambios grandes.</p>' +
      '<div class="actions"><button type="button" class="btn btn--outline btn--sm" id="btn-descargar">Descargar respaldo</button><button type="button" class="btn btn--outline btn--sm" id="btn-descartar">Descartar borrador de parámetros</button></div>' +
      '<div class="adm-help"><strong>Cómo se publica cada cosa</strong><ol><li><strong>Proyectos:</strong> se guardan en la base al instante. imobu.cl se regenera sola (1 a 2 minutos) y mdiaz.cl los muestra en menos de un minuto.</li><li><strong>Parámetros de cada web:</strong> se editan como borrador y se publican con "Guardar y publicar".</li><li><strong>Formularios:</strong> llegan solos desde ambas webs; aquí se gestionan estado y notas.</li></ol></div>';
    $('btn-descargar').addEventListener('click', function () {
      var texto = JSON.stringify({ generado: new Date().toISOString(), sitios: PUB, proyectos: PROY }, null, 2);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      a.download = 'respaldo-webs-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast('Respaldo descargado');
    });
    $('btn-descartar').addEventListener('click', function () {
      if (!confirm('¿Descartar todos los cambios de parámetros no publicados?')) return;
      S = copiar(PUB);
      try { localStorage.removeItem('web-intranet-borrador'); } catch (e) { /* sin almacenamiento */ }
      pintarSitios(); toast('Borrador descartado');
    });
  }

  // ════════════════════ PUBLICAR PARÁMETROS / REGENERAR IMOBU ════════════════════
  function hayErrores() {
    var bad = document.querySelector('.field.is-bad');
    if (bad) { mostrar(bad.closest('.adm-panel').id.replace('panel-', '')); bad.querySelector('input').focus(); toast('Corrige los campos marcados antes de continuar'); return true; }
    return false;
  }
  function publicar() {
    if (hayErrores()) return;
    var cambiados = IDS_SITIOS.filter(function (id) { return !igual(S[id], PUB[id]); });
    if (!cambiados.length) return toast('No hay cambios de parámetros para publicar');
    if (!confirm('¿Publicar los parámetros de ' + cambiados.map(function (id) { return SITIOS[id].nombre; }).join(' y ') + '? Se verán en el sitio en menos de un minuto.')) return;
    var b = $('btn-publicar'); b.disabled = true; b.textContent = 'Publicando…';
    Promise.all(cambiados.map(function (id) {
      return sb.from('web_sitios').upsert({ id: id, nombre: SITIOS[id].nombre, url: SITIOS[id].url, config: S[id] }).then(function (r) { return { id: id, r: r }; });
    })).then(function (rs) {
      b.disabled = false; b.textContent = 'Guardar y publicar';
      var fallo = rs.find(function (x) { return x.r.error; });
      rs.forEach(function (x) { if (!x.r.error) PUB[x.id] = copiar(S[x.id]); });
      guardarBorrador();
      if (fallo) return toast(errorDe(fallo.r, 'publicar'));
      try { localStorage.removeItem('web-intranet-borrador'); } catch (e) { /* sin almacenamiento */ }
      toast('Parámetros publicados');
      if (cambiados.indexOf('imobu') >= 0) pedirRebuild();
    });
  }
  // Las fichas de proyecto de imobu.cl se generan en build: tras un cambio pedimos un redeploy (api/rebuild.js).
  // Se agrupa en 3 s para no lanzar un build por cada clic.
  var rebuildTimer = null;
  function pedirRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      sb.auth.getSession().then(function (q) {
        var token = q.data.session && q.data.session.access_token;
        if (!token) return;
        fetch('/api/rebuild', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j.ok) return;
            var av = $('aviso-rebuild'); av.hidden = false;
            setTimeout(function () { av.hidden = true; }, 120000);
          })
          .catch(function () { /* sin hook: los textos, precios y el catálogo igual se actualizan vía /api/config */ });
      });
    }, 3000);
  }

  $('btn-preview').addEventListener('click', function () {
    if (hayErrores()) return;
    guardarBorrador();
    window.open('index.html?vista-previa=1', '_blank', 'noopener');
  });
  $('btn-publicar').addEventListener('click', publicar);

  function abrirPanel() {
    var borrador = null;
    try { borrador = JSON.parse(localStorage.getItem('web-intranet-borrador') || 'null'); } catch (e) { borrador = null; }
    S = borrador && borrador.imobu && borrador.mdiaz && !igual(borrador, PUB) && confirm('Tienes un borrador de parámetros sin publicar en este navegador. ¿Quieres retomarlo?')
      ? borrador : copiar(PUB);
    vista('panel');
    construir();
    guardarBorrador();
  }

  // ════════════════════ SIN CONEXIÓN ════════════════════
  if (!ONLINE) {
    vista('login');
    msg('login-error', 'La intranet aún no está conectada a la base de datos. Completa js/conexion.js con la URL y la clave pública del proyecto Supabase (ver SEGURIDAD.md).');
    Array.prototype.forEach.call($('form-login').elements, function (el) { el.disabled = true; });
    return;
  }

  // ════════════════════ MODO CONECTADO (Supabase) ════════════════════
  var fallos = 0, bloqueadoHasta = 0, ultimoUso = Date.now(), vigilante = null;

  function cargarSupabase() {
    return new Promise(function (ok, error) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
      s.integrity = 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o';
      s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = error;
      document.head.appendChild(s);
    });
  }

  function entrar(session) {
    return sb.rpc('web_es_admin').then(function (r) {
      if (r.error || r.data !== true) {
        sb.auth.signOut();
        vista('login');
        msg('login-error', 'Tu cuenta no tiene acceso a la intranet. Pide acceso a un administrador.');
        return;
      }
      return Promise.all([
        sb.from('web_sitios').select('id, config'),
        sb.from('web_proyectos').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
      ]).then(function (rs) {
        if (rs[0].error || rs[1].error) { msg('login-error', 'No se pudieron cargar los datos. ¿Se ejecutó supabase/web.sql en el proyecto?'); vista('login'); return; }
        PUB = {};
        IDS_SITIOS.forEach(function (id) { PUB[id] = {}; });
        (rs[0].data || []).forEach(function (s) { if (SITIOS[s.id]) PUB[s.id] = s.config || {}; });
        PROY = rs[1].data || [];
        $('adm-email').textContent = session.user.email;
        $('adm-user').hidden = false;
        abrirPanel();
        listarProyectos();
        vigilarInactividad();
      });
    });
  }

  function salir(motivo) {
    clearInterval(vigilante);
    sb.auth.signOut().finally(function () {
      $('adm-user').hidden = true;
      vista('login');
      msg('login-error', '');
      msg('login-ok', motivo || '');
      $('form-login').reset();
    });
  }

  function vigilarInactividad() {
    ultimoUso = Date.now();
    clearInterval(vigilante);
    vigilante = setInterval(function () {
      if (Date.now() - ultimoUso > INACTIVIDAD_MS) salir('Por seguridad cerramos tu sesión tras 30 minutos sin actividad.');
    }, 30000);
  }
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (ev) {
    window.addEventListener(ev, function () { ultimoUso = Date.now(); }, { passive: true });
  });
  $('btn-salir').addEventListener('click', function () { salir('Sesión cerrada.'); });

  // Ingreso
  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this, b = $('btn-login');
    msg('login-ok', '');
    if (Date.now() < bloqueadoHasta) return msg('login-error', 'Demasiados intentos. Espera un minuto antes de volver a intentar.');
    var email = f.email.value.trim().toLowerCase(), clave = f.clave.value;
    if (!email || !clave) return msg('login-error', 'Ingresa tu correo y tu clave.');
    b.disabled = true; b.textContent = 'Verificando…';
    sb.auth.signInWithPassword({ email: email, password: clave }).then(function (r) {
      b.disabled = false; b.textContent = 'Ingresar';
      f.clave.value = '';
      if (r.error) {
        fallos++;
        if (fallos >= 5) { bloqueadoHasta = Date.now() + 60000; fallos = 0; }
        return msg('login-error', 'Correo o clave incorrectos.');
      }
      fallos = 0; msg('login-error', '');
      entrar(r.data.session);
    });
  });

  // Recuperar clave
  $('btn-olvide').addEventListener('click', function () {
    var email = $('form-login').email.value.trim().toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)) return msg('login-error', 'Escribe tu correo arriba y vuelve a presionar "¿Olvidaste tu clave?".');
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function () {
      msg('login-error', '');
      msg('login-ok', 'Si el correo está registrado, te enviamos un enlace para crear una nueva clave.');
    });
  });

  // Crear clave (invitación o recuperación)
  $('form-clave').addEventListener('submit', function (e) {
    e.preventDefault();
    var c1 = this.clave.value, c2 = this.clave2.value;
    if (c1.length < 12 || !/[a-z]/i.test(c1) || !/\d/.test(c1)) return msg('clave-error', 'La clave debe tener al menos 12 caracteres, con letras y números.');
    if (c1 !== c2) return msg('clave-error', 'Las claves no coinciden.');
    sb.auth.updateUser({ password: c1 }).then(function (r) {
      if (r.error) return msg('clave-error', 'No se pudo guardar la clave. El enlace puede haber expirado: pide uno nuevo.');
      history.replaceState(null, '', location.pathname);
      sb.auth.getSession().then(function (s) { if (s.data.session) entrar(s.data.session); });
    });
  });

  cargarSupabase().then(function () {
    var vieneDeEnlace = /type=(invite|recovery)/.test(location.hash);
    sb = window.supabase.createClient(CX.supabaseUrl, CX.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'web-intranet' }
    });
    sb.auth.onAuthStateChange(function (evento) {
      if (evento === 'PASSWORD_RECOVERY') vista('clave');
    });
    sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      if (session && vieneDeEnlace) { vista('clave'); return; }
      if (session) entrar(session); else vista('login');
    });
  }, function () {
    vista('login');
    msg('login-error', 'No se pudo cargar el sistema de ingreso. Revisa tu conexión a internet.');
    $('btn-login').disabled = true;
  });
})();
