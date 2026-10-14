(function () {
  var CX = window.IMOBU_CONEXION || {};
  var ONLINE = !!(CX.supabaseUrl && CX.supabaseAnonKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CX.supabaseUrl));
  var INACTIVIDAD_MS = 30 * 60 * 1000;
  var sb = null;

  var PUBLICADO = JSON.parse(JSON.stringify(window.IMOBU_CONFIG || {}));
  var C = null;

  var $ = function (id) { return document.getElementById(id); };
  var copiar = function (o) { return JSON.parse(JSON.stringify(o)); };
  var get = function (path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, C); };
  var set = function (path, v) {
    var ks = path.split('.'), o = C;
    ks.slice(0, -1).forEach(function (k) { if (o[k] == null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = v;
  };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slug = function (t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^proyecto\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var fecha = function (iso) { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };

  function vista(nombre) {
    ['login', 'clave', 'panel'].forEach(function (v) { $('vista-' + v).hidden = v !== nombre; });
  }
  function toast(t) {
    var el = $('toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3200);
  }
  function msg(id, texto) { var el = $(id); el.textContent = texto || ''; el.hidden = !texto; }

  // ── Borrador local (para la vista previa) ──
  function guardarBorrador() {
    try { localStorage.setItem('imobu-config-borrador', JSON.stringify(C)); } catch (e) { /* sin almacenamiento */ }
    var cambios = JSON.stringify(C) !== JSON.stringify(PUBLICADO);
    var est = $('estado');
    est.textContent = cambios ? 'Cambios sin publicar' : (ONLINE ? 'Publicado' : 'Sin cambios');
    est.className = 'adm-estado' + (cambios ? ' adm-estado--cambios' : (ONLINE ? ' adm-estado--ok' : ''));
  }

  // ════════════════════ EDITOR ════════════════════
  var SECCIONES = [
    { id: 'general', titulo: 'Contacto y redes', intro: 'Datos del pie de página, los botones de WhatsApp y los links a redes de todas las páginas.', campos: [
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
    { id: 'finanzas', titulo: 'Supuestos financieros', intro: 'Se usan en el dividendo de las tarjetas, el simulador de cada proyecto y el pre-diagnóstico de la evaluación. Actualiza la UF y la tasa periódicamente.', campos: [
      ['finanzas.uf', 'Valor UF ($)', 'number', { min: 30000, max: 60000, step: 1 }],
      ['finanzas.tasaAnual', 'Tasa anual crédito (%)', 'number', { min: 1, max: 15, step: 0.01 }],
      ['finanzas.plazoAnos', 'Plazo del crédito (años)', 'number', { min: 5, max: 40, step: 1 }],
      ['finanzas.piePct', 'Pie (%)', 'number', { min: 5, max: 50, step: 1 }],
      ['finanzas.dividendoMaxPct', 'Dividendo máximo sobre la renta (%)', 'number', { min: 10, max: 50, step: 1 }],
      ['finanzas.cargaMaxPct', 'Carga financiera máxima (%)', 'number', { min: 20, max: 70, step: 1 }],
      ['finanzas.rentaMinima', 'Renta mínima referencial ($)', 'number', { min: 0, max: 5000000, step: 10000 }]
    ] },
    { id: 'brokers', titulo: 'Programa Brokers', intro: 'Parámetros de la landing de brokers y su simulador de ingresos.', campos: [
      ['brokers.comisionPct', 'Comisión del broker sobre el valor de la unidad (%)', 'number', { min: 0.1, max: 10, step: 0.05, hint: 'Confirma este valor con el plan de comisiones real.' }],
      ['brokers.proximaGeneracion', 'Próxima generación (texto)', 'text', { hint: 'Ej: Lunes 2 de noviembre' }],
      ['brokers.duracionOnboarding', 'Duración del onboarding', 'text', { hint: 'Ej: 4 semanas' }]
    ] },
    { id: 'formularios', titulo: 'Formularios', intro: 'Dónde llegan los formularios y la verificación anti-bots. Ver SEGURIDAD.md.', aviso: 'Aquí solo van datos PÚBLICOS. Nunca escribas contraseñas ni claves secretas: estos parámetros se publican en el sitio y cualquiera puede leerlos. Las claves secretas van en las variables de entorno del hosting.', campos: [
      ['formularios.endpoint', 'Dirección del receptor de formularios', 'endpoint', { hint: 'Normalmente /api/formulario. Vacío = modo demostración (no se envía nada).' }],
      ['formularios.turnstileSiteKey', 'Cloudflare Turnstile: clave del sitio (pública)', 'text', { hint: 'La "site key", NO la "secret key". Vacío = sin verificación anti-bots visible.' }]
    ] }
  ];

  var VALIDA = {
    url: function (v) { return !v || /^https:\/\/[^\s<>"]+$/.test(v) ? '' : 'Debe comenzar con https://'; },
    email: function (v) { return !v || /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(v) ? '' : 'Correo no válido'; },
    whatsapp: function (v) { return /^56\d{8,9}$/.test(v) ? '' : 'Solo números, comenzando con 56 (ej: 56984336430)'; },
    endpoint: function (v) { return !v || /^\/[a-z0-9/_-]*$/i.test(v) || /^https:\/\/[^\s<>"]+$/.test(v) ? '' : 'Usa una ruta como /api/formulario o una URL https://'; },
    text: function (v) { return /[<>]/.test(v) ? 'No uses los caracteres < >' : ''; }
  };

  function campoHTML(c) {
    var ruta = c[0], label = c[1], tipo = c[2], o = c[3] || {};
    var v = get(ruta);
    var inputType = tipo === 'number' ? 'number' : tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : 'text';
    var attrs = tipo === 'number' ? ' min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" inputmode="decimal"' : ' maxlength="200"';
    return '<label class="field" data-ruta="' + ruta + '" data-tipo="' + tipo + '">' + esc(label) +
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
    if (r.ok) { set(label.getAttribute('data-ruta'), r.valor); guardarBorrador(); }
  }

  var tabs = $('tabs'), paneles = $('paneles');
  var construido = false;
  function construir() {
    if (construido) return reconstruir();
    construido = true;
    var todas = SECCIONES.map(function (s) { return { id: s.id, titulo: s.titulo }; })
      .concat([{ id: 'proyectos', titulo: 'Proyectos' }, { id: 'asesores', titulo: 'Asesores' }])
      .concat(ONLINE ? [{ id: 'postulantes', titulo: 'Postulantes' }, { id: 'historial', titulo: 'Historial' }] : [])
      .concat([{ id: 'publicar', titulo: ONLINE ? 'Respaldo' : 'Cómo publicar' }]);
    todas.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'tab-' + s.id;
      b.setAttribute('aria-controls', 'panel-' + s.id);
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      b.textContent = s.titulo;
      b.addEventListener('click', function () { mostrar(s.id); });
      tabs.appendChild(b);
    });
    SECCIONES.forEach(function (s) {
      var p = nuevoPanel(s.id);
      p.innerHTML = '<h2>' + esc(s.titulo) + '</h2><p>' + esc(s.intro) + '</p>' +
        (s.aviso ? '<div class="adm-warn">' + esc(s.aviso) + '</div>' : '') +
        '<div class="adm-grid">' + s.campos.map(campoHTML).join('') + '</div>';
      p.addEventListener('input', alEditar);
    });
    construirProyectos();
    var pAse = nuevoPanel('asesores');
    pAse.addEventListener('input', alEditar);
    if (ONLINE) { construirPostulantes(); construirHistorial(); }
    construirPublicar();
    listarProyectos(); listarAsesores();
    mostrar('general');
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
    if (id === 'postulantes') cargarPostulantes();
  }
  function reconstruir() {
    SECCIONES.forEach(function (s) {
      document.querySelectorAll('#panel-' + s.id + ' [data-ruta]').forEach(function (label) {
        var v = get(label.getAttribute('data-ruta'));
        label.querySelector('input').value = v == null ? '' : v;
        validarCampo(label);
      });
    });
    listarProyectos(); listarAsesores(); guardarBorrador();
  }

  // ── Proyectos ──
  var editIndex = -1;
  var fotoUrl = function (f) { return /^https?:\/\//.test(f) ? f : 'https://images.unsplash.com/' + f + '?w=200&q=60&auto=format&fit=crop'; };
  function construirProyectos() {
    var p = nuevoPanel('proyectos');
    p.innerHTML = '<h2>Proyectos</h2><p>Catálogo, fichas, destacados del inicio y recomendaciones de la evaluación salen de esta lista. Usa ↑ ↓ para ordenar.</p>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th></th><th>Proyecto</th><th class="col-ocultable">Comuna</th><th>Desde</th><th class="col-ocultable">Estado</th><th></th></tr></thead><tbody id="proy-list"></tbody></table></div>' +
      '<button type="button" class="btn btn--primary btn--sm" id="proy-nuevo" style="margin-top: 16px">+ Agregar proyecto</button>' +
      '<form class="editor" id="proy-editor" hidden novalidate>' +
        '<h3 id="proy-editor-titulo">Editar proyecto</h3>' +
        '<div class="adm-grid">' +
          '<label class="field">Nombre<input name="nombre" maxlength="80" required></label>' +
          '<label class="field">Identificador para la URL<input name="id" maxlength="60" pattern="[a-z0-9\\-]+" required><span class="adm-hint">Solo minúsculas, números y guiones.</span></label>' +
          '<label class="field">Inmobiliaria<input name="inmobiliaria" maxlength="60" required></label>' +
          '<label class="field">Comuna<input name="comuna" maxlength="60" required></label>' +
          '<label class="field">Precio desde (UF)<input name="uf" type="number" min="300" max="100000" step="1" required></label>' +
          '<label class="field">Entrega<select name="entrega"><option value="inmediata">Inmediata</option><option value="futura">Futura</option></select></label>' +
          '<label class="field">Superficies<input name="m2" maxlength="40" placeholder="Ej: 30 a 55 m²" required></label>' +
          '<fieldset class="choice-group"><legend>Tipologías</legend><div class="dorms">' +
            [0, 1, 2, 3, 4].map(function (d) { return '<label class="choice"><input type="checkbox" name="dorm" value="' + d + '"><span>' + (d === 0 ? 'Studio' : d + 'D') + '</span></label>'; }).join('') +
          '</div></fieldset>' +
          '<label class="field full">Foto (ID de Unsplash o URL https)<div class="editor__foto"><img id="proy-foto-prev" alt=""><input name="foto" maxlength="300" required style="flex: 1"></div><span class="adm-hint">Idealmente sube la foto real al sitio y escribe su URL completa.</span></label>' +
          '<label class="field full">Descripción de la foto (accesibilidad)<input name="alt" maxlength="140" required></label>' +
          '<label class="check"><input type="checkbox" name="destacado"><span>Destacado en el inicio</span></label>' +
          '<label class="check"><input type="checkbox" name="ejemplo"><span>Es un proyecto de ejemplo (no real)</span></label>' +
        '</div>' +
        '<p class="form-error" id="proy-error" hidden style="margin-top: 14px"></p>' +
        '<div class="actions" style="margin-top: 20px"><button type="submit" class="btn btn--primary btn--sm">Guardar proyecto</button><button type="button" class="btn btn--outline btn--sm" id="proy-cancelar">Cancelar</button></div>' +
      '</form>';

    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-acc]');
      if (!b) return;
      var i = Number(b.getAttribute('data-i')), L = C.proyectos, acc = b.getAttribute('data-acc');
      if (acc === 'editar') return abrirEditor(i);
      if (acc === 'borrar') { if (!confirm('¿Eliminar "' + L[i].nombre + '" de la lista?')) return; L.splice(i, 1); }
      if (acc === 'subir' && i > 0) L.splice(i - 1, 0, L.splice(i, 1)[0]);
      if (acc === 'bajar' && i < L.length - 1) L.splice(i + 1, 0, L.splice(i, 1)[0]);
      guardarBorrador(); listarProyectos();
    });
    $('proy-nuevo').addEventListener('click', function () { abrirEditor(-1); });
    $('proy-cancelar').addEventListener('click', function () { $('proy-editor').hidden = true; });
    var ed = $('proy-editor');
    ed.elements.nombre.addEventListener('input', function () { if (editIndex < 0) ed.elements.id.value = slug(this.value); });
    ed.elements.foto.addEventListener('change', function () { $('proy-foto-prev').src = this.value.trim() ? fotoUrl(this.value.trim()) : ''; });
    ed.addEventListener('submit', guardarProyecto);
  }
  function listarProyectos() {
    var lista = C.proyectos || [];
    $('proy-list').innerHTML = lista.map(function (p, i) {
      return '<tr><td><img src="' + esc(fotoUrl(p.foto)) + '" alt=""></td>' +
        '<td><strong>' + esc(p.nombre) + '</strong><br><span class="adm-hint">' + esc(p.inmobiliaria) + '</span></td>' +
        '<td class="col-ocultable">' + esc(p.comuna) + '</td><td>UF ' + Number(p.uf).toLocaleString('es-CL') + '</td>' +
        '<td class="col-ocultable">' + (p.destacado ? '<span class="pill pill--dest">Destacado</span> ' : '') + (p.ejemplo ? '<span class="pill pill--ejemplo">Ejemplo</span>' : '') + '</td>' +
        '<td><div class="acciones">' +
          '<button type="button" class="mini-btn" data-acc="subir" data-i="' + i + '" aria-label="Subir ' + esc(p.nombre) + '">↑</button>' +
          '<button type="button" class="mini-btn" data-acc="bajar" data-i="' + i + '" aria-label="Bajar ' + esc(p.nombre) + '">↓</button>' +
          '<button type="button" class="mini-btn" data-acc="editar" data-i="' + i + '">Editar</button>' +
          '<button type="button" class="mini-btn mini-btn--peligro" data-acc="borrar" data-i="' + i + '">Eliminar</button>' +
        '</div></td></tr>';
    }).join('');
  }
  function abrirEditor(i) {
    editIndex = i;
    var f = $('proy-editor');
    var p = i >= 0 ? C.proyectos[i] : { nombre: '', id: '', inmobiliaria: '', comuna: '', uf: '', entrega: 'inmediata', dorm: [1, 2], m2: '', foto: '', alt: '', destacado: false, ejemplo: false };
    $('proy-editor-titulo').textContent = i >= 0 ? 'Editar: ' + p.nombre : 'Nuevo proyecto';
    ['nombre', 'id', 'inmobiliaria', 'comuna', 'uf', 'entrega', 'm2', 'foto', 'alt'].forEach(function (k) { f.elements[k].value = p[k] == null ? '' : p[k]; });
    f.querySelectorAll('input[name="dorm"]').forEach(function (c) { c.checked = (p.dorm || []).indexOf(Number(c.value)) >= 0; });
    f.elements.destacado.checked = !!p.destacado;
    f.elements.ejemplo.checked = !!p.ejemplo;
    $('proy-foto-prev').src = p.foto ? fotoUrl(p.foto) : '';
    $('proy-error').hidden = true;
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    f.elements.nombre.focus({ preventScroll: true });
  }
  function guardarProyecto(e) {
    e.preventDefault();
    var f = $('proy-editor'), m = '';
    var dorm = Array.prototype.filter.call(f.querySelectorAll('input[name="dorm"]'), function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
    var foto = f.elements.foto.value.trim();
    var bad = Array.prototype.find.call(f.querySelectorAll('[required]'), function (x) { return !x.checkValidity(); });
    if (bad) m = 'Revisa el campo "' + bad.closest('label').firstChild.textContent.trim() + '".';
    else if (!dorm.length) m = 'Marca al menos una tipología.';
    else if (!/^photo-[\w-]+$/.test(foto) && !/^https:\/\/[^\s<>"]+$/.test(foto)) m = 'La foto debe ser un ID de Unsplash (photo-…) o una URL que comience con https://';
    else if (/[<>]/.test(['nombre', 'inmobiliaria', 'comuna', 'm2', 'alt'].map(function (k) { return f.elements[k].value; }).join(''))) m = 'No uses los caracteres < >';
    else if ((C.proyectos || []).some(function (p, i) { return p.id === f.elements.id.value && i !== editIndex; })) m = 'Ya existe un proyecto con ese identificador.';
    if (m) { $('proy-error').textContent = m; $('proy-error').hidden = false; return; }
    var p = {
      id: f.elements.id.value, nombre: f.elements.nombre.value.trim(), inmobiliaria: f.elements.inmobiliaria.value.trim(),
      comuna: f.elements.comuna.value.trim(), uf: Number(f.elements.uf.value), entrega: f.elements.entrega.value, dorm: dorm,
      m2: f.elements.m2.value.trim(), destacado: f.elements.destacado.checked, ejemplo: f.elements.ejemplo.checked,
      foto: foto, alt: f.elements.alt.value.trim()
    };
    C.proyectos = C.proyectos || [];
    if (editIndex >= 0) C.proyectos[editIndex] = p; else C.proyectos.push(p);
    guardarBorrador(); listarProyectos();
    f.hidden = true;
    toast('Proyecto guardado en el borrador');
  }

  // ── Asesores ──
  var CAMPOS_ASESOR = [
    ['nombre', 'Nombre', 'text'], ['cargo', 'Cargo', 'text'], ['whatsapp', 'WhatsApp', 'whatsapp'], ['telefono', 'Teléfono visible', 'text'],
    ['instagram', 'Instagram (URL)', 'url'], ['tiktok', 'TikTok (URL)', 'url'], ['linkedin', 'LinkedIn (URL)', 'url'], ['facebook', 'Facebook (URL)', 'url'],
    ['foto', 'Foto principal (URL)', 'url'], ['fotoTrabajo', 'Foto trabajando (URL)', 'url'], ['fotoLlamada', 'Foto en llamada (URL)', 'url']
  ];
  function listarAsesores() {
    $('panel-asesores').innerHTML = '<h2>Asesores</h2><p>Datos de las páginas personales de los asesores (por ejemplo marcela/). Los clientes que llegan desde esas páginas quedan atribuidos al asesor.</p>' +
      (C.asesores || []).map(function (a, i) {
        return '<div class="asesor-card"><div class="asesor-card__head"><strong>' + esc(a.nombre) + '</strong> <span class="adm-hint">· id: ' + esc(a.id) + '</span></div>' +
          '<div class="adm-grid">' + CAMPOS_ASESOR.map(function (c) { return campoHTML(['asesores.' + i + '.' + c[0], c[1], c[2]]); }).join('') + '</div></div>';
      }).join('');
  }

  // ── Historial (solo conectado) ──
  // ── Postulantes a broker (tabla imobu_leads; los clientes van a Brouk, ver api/formulario.js) ──
  var ESTADOS = ['Nuevo', 'Contactado', 'Entrevista', 'Aceptado', 'Activo', 'Descartado'];
  function construirPostulantes() {
    var p = nuevoPanel('postulantes');
    p.innerHTML = '<h2>Postulantes a broker</h2><p>Llegan desde los formularios "Sé broker" y de registro al programa. Cambia el estado y escribe notas; se guardan solos. Al aceptar a alguien, créalo como asesor en brouk.app.</p>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th>Fecha</th><th>Postulante</th><th class="col-ocultable">Perfil</th><th>Estado</th><th class="col-ocultable">Notas</th></tr></thead><tbody id="post-list"><tr><td colspan="5">Cargando…</td></tr></tbody></table></div>';
    p.addEventListener('change', function (e) {
      var el = e.target.closest('[data-lead]');
      if (!el) return;
      var cambio = {};
      cambio[el.getAttribute('data-campo')] = el.value.trim();
      sb.from('imobu_leads').update(cambio).eq('id', Number(el.getAttribute('data-lead'))).then(function (r) {
        toast(r.error ? 'No se pudo guardar el cambio' : 'Guardado');
      });
    });
  }
  function cargarPostulantes() {
    if (!sb) return;
    sb.from('imobu_leads').select('id, recibido, tipo, asesor, estado, notas, datos')
      .in('tipo', ['postulacion-broker', 'registro-asesor']).order('id', { ascending: false }).limit(200).then(function (r) {
      var tb = $('post-list');
      if (r.error) { tb.innerHTML = '<tr><td colspan="5">No se pudieron cargar los postulantes.</td></tr>'; return; }
      tb.innerHTML = r.data.length ? r.data.map(function (l) {
        var d = l.datos || {};
        var perfil = l.tipo === 'registro-asesor' ? 'Registro de interés · ' + (d.interes || '') : [d.comuna, d.experiencia, d.disponibilidad].filter(Boolean).join(' · ');
        return '<tr><td>' + esc(fecha(l.recibido)) + '</td>' +
          '<td><strong>' + esc(d.nombre || '—') + '</strong><br><span class="adm-hint">' + esc(d.telefono || '') + (d.email ? ' · ' + esc(d.email) : '') + '</span></td>' +
          '<td class="col-ocultable">' + esc(perfil) + (d.linkedin ? ' · <a href="' + esc(d.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : '') + '</td>' +
          '<td><select data-lead="' + l.id + '" data-campo="estado">' + ESTADOS.map(function (e) { return '<option' + (e === l.estado ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></td>' +
          '<td class="col-ocultable"><input data-lead="' + l.id + '" data-campo="notas" maxlength="1000" value="' + esc(l.notas || '') + '" placeholder="Notas"></td></tr>';
      }).join('') : '<tr><td colspan="5">Aún no hay postulantes.</td></tr>';
    });
  }

  function construirHistorial() {
    var p = nuevoPanel('historial');
    p.innerHTML = '<h2>Historial de cambios</h2><p>Cada publicación queda registrada con su autor. Puedes cargar una versión anterior como borrador, revisarla y volver a publicarla.</p>' +
      '<div style="overflow-x: auto"><table class="tabla"><thead><tr><th>Fecha</th><th>Publicado por</th><th></th></tr></thead><tbody id="hist-list"><tr><td colspan="3">Cargando…</td></tr></tbody></table></div>';
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hist]');
      if (!b) return;
      if (!confirm('¿Cargar esta versión como borrador? Podrás revisarla antes de publicar.')) return;
      sb.from('imobu_config_historial').select('data').eq('id', Number(b.getAttribute('data-hist'))).single().then(function (r) {
        if (r.error || !r.data) return toast('No se pudo cargar esa versión');
        C = r.data.data; reconstruir(); mostrar('general');
        toast('Versión cargada como borrador. Revisa y presiona "Guardar y publicar".');
      });
    });
  }
  function cargarHistorial() {
    if (!sb) return;
    sb.from('imobu_config_historial').select('id, cambiado, cambiado_por').order('id', { ascending: false }).limit(25).then(function (r) {
      var tb = $('hist-list');
      if (r.error) { tb.innerHTML = '<tr><td colspan="3">No se pudo cargar el historial.</td></tr>'; return; }
      tb.innerHTML = r.data.length ? r.data.map(function (h, i) {
        return '<tr><td>' + esc(fecha(h.cambiado)) + (i === 0 ? ' <span class="pill pill--dest">Actual</span>' : '') + '</td><td>' + esc(h.cambiado_por || '—') + '</td>' +
          '<td><div class="acciones">' + (i === 0 ? '' : '<button type="button" class="mini-btn" data-hist="' + h.id + '">Restaurar</button>') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="3">Aún no hay publicaciones.</td></tr>';
    });
  }

  // ── Publicar / respaldo ──
  function construirPublicar() {
    var p = nuevoPanel('publicar');
    p.innerHTML = ONLINE
      ? '<h2>Respaldo</h2><p>Los cambios se publican con el botón <strong>Guardar y publicar</strong> y se ven en el sitio en menos de un minuto. Aquí puedes descargar un respaldo o cargar uno guardado.</p>' +
        '<div class="actions"><button type="button" class="btn btn--outline btn--sm" id="btn-descargar-2">Descargar respaldo (config.js)</button><button type="button" class="btn btn--outline btn--sm" id="btn-cargar">Cargar un respaldo</button><button type="button" class="btn btn--outline btn--sm" id="btn-descartar">Descartar borrador</button></div>'
      : '<h2>Cómo publicar los cambios</h2><p>En modo local este panel no modifica el sitio publicado: genera el archivo de parámetros.</p>' +
        '<div class="adm-help"><strong>Pasos</strong><ol><li>Edita lo que necesites (se guarda como borrador en este navegador).</li><li>Presiona <strong>Vista previa</strong> para revisar el sitio con tus cambios.</li><li>Presiona <strong>Descargar config.js</strong>.</li><li>Reemplaza <code>js/config.js</code> en el sitio y vuelve a publicar.</li></ol></div>' +
        '<div class="actions" style="margin-top: 24px"><button type="button" class="btn btn--outline btn--sm" id="btn-cargar">Cargar un config.js guardado</button><button type="button" class="btn btn--outline btn--sm" id="btn-descartar">Descartar borrador</button></div>';
    $('btn-cargar').addEventListener('click', function () { $('file-input').click(); });
    $('btn-descartar').addEventListener('click', function () {
      if (!confirm('¿Descartar todos los cambios no publicados?')) return;
      C = copiar(PUBLICADO);
      try { localStorage.removeItem('imobu-config-borrador'); } catch (e) { /* sin almacenamiento */ }
      reconstruir(); toast('Borrador descartado');
    });
    if ($('btn-descargar-2')) $('btn-descargar-2').addEventListener('click', descargar);
  }

  function hayErrores() {
    var bad = document.querySelector('.field.is-bad');
    if (bad) { mostrar(bad.closest('.adm-panel').id.replace('panel-', '')); bad.querySelector('input').focus(); toast('Corrige los campos marcados antes de continuar'); return true; }
    return false;
  }
  function descargar() {
    if (hayErrores()) return;
    var texto = '/* IMOBU — parámetros del sitio. Generado desde la intranet el ' + new Date().toLocaleString('es-CL') + '.\n' +
      '   Proyectos con "ejemplo": true son de EJEMPLO: reemplazar por reales antes de publicar. */\n' +
      'var IMOBU_CONFIG = ' + JSON.stringify(C, null, 2) + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/javascript' }));
    a.download = 'config.js';
    document.body.appendChild(a); a.click(); a.remove();
    toast('config.js descargado');
  }
  function publicar() {
    if (hayErrores()) return;
    if (JSON.stringify(C) === JSON.stringify(PUBLICADO)) return toast('No hay cambios para publicar');
    if (!confirm('¿Publicar los cambios en el sitio? Se verán en menos de un minuto.')) return;
    var b = $('btn-publicar'); b.disabled = true; b.textContent = 'Publicando…';
    sb.from('imobu_config').upsert({ id: 1, data: C }).then(function (r) {
      b.disabled = false; b.textContent = 'Guardar y publicar';
      if (r.error) return toast(r.error.code === '42501' ? 'Tu cuenta no tiene permiso para publicar.' : 'No se pudo publicar. Revisa tu conexión o vuelve a ingresar.');
      PUBLICADO = copiar(C);
      try { localStorage.removeItem('imobu-config-borrador'); } catch (e) { /* sin almacenamiento */ }
      guardarBorrador();
      toast('Cambios publicados');
    });
  }

  $('btn-preview').addEventListener('click', function () {
    if (hayErrores()) return;
    guardarBorrador();
    window.open('index.html?vista-previa=1', '_blank', 'noopener');
  });
  $('btn-descargar').addEventListener('click', descargar);
  $('btn-publicar').addEventListener('click', function () { publicar(); });
  $('file-input').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    if (file.size > 500000) { toast('El archivo es demasiado grande'); return; }
    var r = new FileReader();
    r.onload = function () {
      try {
        var t = String(r.result);
        var obj = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
        if (!obj.sitio || !Array.isArray(obj.proyectos)) throw new Error('formato');
        C = obj; reconstruir(); toast('Archivo cargado como borrador');
      } catch (e) { toast('No se pudo leer el archivo: ¿es un config.js del sitio?'); }
    };
    r.readAsText(file);
    this.value = '';
  });

  function abrirPanel() {
    var borrador = null;
    try { borrador = JSON.parse(localStorage.getItem('imobu-config-borrador') || 'null'); } catch (e) { borrador = null; }
    C = borrador && JSON.stringify(borrador) !== JSON.stringify(PUBLICADO) && confirm('Tienes un borrador sin publicar en este navegador. ¿Quieres retomarlo?')
      ? borrador : copiar(PUBLICADO);
    $('aviso-local').hidden = ONLINE;
    $('btn-publicar').hidden = !ONLINE;
    $('btn-descargar').hidden = ONLINE;
    vista('panel');
    construir();
    guardarBorrador();
  }

  // ════════════════════ MODO LOCAL ════════════════════
  if (!ONLINE) {
    // Sin conexión, el panel solo se abre desde el computador (archivo local o servidor local),
    // nunca desde el sitio publicado: ahí muestra que la intranet aún no está activa.
    if (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) { abrirPanel(); return; }
    vista('login');
    msg('login-error', 'La intranet aún no está activada. Contacta al administrador del sitio.');
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
    return sb.rpc('imobu_es_admin').then(function (r) {
      if (r.error || r.data !== true) {
        sb.auth.signOut();
        vista('login');
        msg('login-error', 'Tu cuenta no tiene acceso a la intranet. Pide acceso a un administrador.');
        return;
      }
      return sb.from('imobu_config').select('data').eq('id', 1).maybeSingle().then(function (q) {
        if (q.data && q.data.data) PUBLICADO = q.data.data;
        $('adm-email').textContent = session.user.email;
        $('adm-user').hidden = false;
        abrirPanel();
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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'imobu-intranet' }
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
