(function () {
  // Supuestos del pre-diagnóstico: se ajustan en js/imobu.js (IMOBU.cfg)
  var cfg = IMOBU.cfg;
  var UF = cfg.UF, DIV_MAX = cfg.DIV_MAX, CARGA_MAX = cfg.CARGA_MAX, PIE = cfg.PIE;
  var RENTA_MIN = cfg.RENTA_MIN;   // renta mínima referencial de algunos bancos

  var form = document.getElementById('eval-form');
  var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
  var progress = Array.prototype.slice.call(document.querySelectorAll('#progress li'));
  var btnBack = document.getElementById('btn-back');
  var btnNext = document.getElementById('btn-next');
  var btnSubmit = document.getElementById('btn-submit');
  var stepError = document.getElementById('step-error');
  var current = 0;

  var clp = IMOBU.clp, ufFmt = IMOBU.uf;
  var mini = document.getElementById('diag-mini');
  var enviado = false;
  var money = function (name) { var el = form.elements[name]; return el ? Number(String(el.value).replace(/\D/g, '')) || 0 : 0; };
  var val = function (name) { var el = form.elements[name]; return el ? (el.value || '') : ''; };

  // Proyecto que viene desde la ficha (?proyecto=)
  var proyecto = new URLSearchParams(location.search).get('proyecto');
  if (proyecto) document.getElementById('proyecto').value = proyecto;

  // Formato de montos en pesos mientras se escribe
  form.querySelectorAll('[data-money]').forEach(function (input) {
    input.addEventListener('input', function () {
      var digits = input.value.replace(/\D/g, '').slice(0, 11);
      input.value = digits ? '$' + Number(digits).toLocaleString('es-CL') : '';
    });
  });

  // Complemento de renta: muestra el panel y vuelve obligatorios sus campos
  var compPanel = document.getElementById('comp-panel');
  function syncComplemento() {
    var on = val('complementa') === 'si';
    compPanel.hidden = !on;
    compPanel.querySelectorAll('[data-required-if-comp]').forEach(function (f) { f.required = on; });
  }

  function showStep(i) {
    current = i;
    steps.forEach(function (s, k) { s.hidden = k !== i; });
    progress.forEach(function (li, k) {
      li.classList.toggle('is-done', k < i);
      li.classList.toggle('is-current', k === i);
      if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    btnBack.hidden = i === 0;
    btnNext.hidden = i === steps.length - 1;
    btnSubmit.hidden = i !== steps.length - 1;
    document.getElementById('step-count').textContent = 'Paso ' + (i + 1) + ' de ' + steps.length;
    stepError.hidden = true;
  }

  function validateStep(i) {
    var step = steps[i];
    var firstBad = null;
    step.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (f) {
      if (f.closest('[hidden]') && f.closest('[hidden]') !== step) return;
      var bad = !f.checkValidity() || (f.hasAttribute('data-money') && f.value === '' );
      if (f.type !== 'checkbox') f.style.borderColor = bad ? '#C40C4B' : '';
      if (bad && !firstBad) firstBad = f;
    });
    step.querySelectorAll('.choice-group[data-required]').forEach(function (g) {
      var ok = !!g.querySelector('input:checked');
      g.classList.toggle('is-invalid', !ok);
      if (!ok && !firstBad) firstBad = g.querySelector('input');
    });
    stepError.textContent = 'Completa los campos marcados para continuar.';
    stepError.hidden = !firstBad;
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function goTo(i) {
    showStep(i);
    var title = steps[i].querySelector('.step__title');
    document.getElementById('wizard').scrollIntoView({ block: 'start' });
    title.focus({ preventScroll: true });
  }

  btnNext.addEventListener('click', function () { if (validateStep(current)) goTo(current + 1); });
  btnBack.addEventListener('click', function () { goTo(current - 1); });

  form.addEventListener('change', function (e) {
    if (e.target.name === 'complementa') syncComplemento();
    var g = e.target.closest('.choice-group');
    if (g) g.classList.remove('is-invalid');
    diagnose();
  });
  form.addEventListener('input', diagnose);

  // Pre-diagnóstico referencial
  function diagnose() {
    var renta = money('renta');
    var empty = document.getElementById('diag-empty');
    var body = document.getElementById('diag-body');
    if (!renta) { empty.hidden = false; body.hidden = true; toggleMini(false); return null; }
    empty.hidden = true; body.hidden = false;

    var comp = val('complementa') === 'si' ? money('comp_renta') : 0;
    var rentaTotal = renta + money('otros_ingresos') + comp;
    var deudas = money('deuda_consumo') + money('deuda_tarjetas') + money('deuda_hipotecario');
    var dividendo = Math.max(0, Math.min(DIV_MAX * rentaTotal, CARGA_MAX * rentaTotal - deudas));
    var creditoUF = IMOBU.creditoDesdeDividendo(dividendo);
    var precioUF = creditoUF / (1 - PIE);
    var pieUF = precioUF * PIE;
    var ahorroUF = money('ahorro_pie') / UF;
    var carga = deudas / rentaTotal;

    var ok = [], warn = [], severo = false;
    var situacion = val('situacion'), antig = val('antiguedad'), dicom = val('dicom'), edad = Number(val('edad')) || 0;
    if (situacion === 'Dependiente con contrato indefinido' && antig && antig !== 'Menos de 1 año') ok.push('Contrato indefinido con antigüedad: muy bien valorado por los bancos.');
    if (antig === 'Menos de 1 año') warn.push('Antigüedad menor a 1 año: varios bancos piden entre 1 y 2 años.');
    if (situacion === 'Dependiente con contrato a plazo fijo') warn.push('Contrato a plazo fijo: los bancos suelen preferir contrato indefinido.');
    if (situacion === 'Independiente con boletas de honorarios' || situacion === 'Empresario/a o socio/a') warn.push('Como independiente te pedirán tus últimas declaraciones de renta (F22) y boletas.');
    if (dicom === 'No registro morosidades') ok.push('Sin morosidades declaradas.');
    if (dicom === 'Sí, tengo morosidades vigentes') { warn.push('Morosidades vigentes: hay que regularizarlas antes de postular al crédito.'); severo = true; }
    if (dicom === 'No lo sé') warn.push('Revisa tu informe comercial; te ayudamos a interpretarlo.');
    if (val('residencia') === 'Extranjera con residencia temporal') { warn.push('La mayoría de los bancos exige residencia definitiva.'); severo = true; }
    if (renta < RENTA_MIN && !comp) warn.push('Renta bajo el mínimo de algunos bancos: complementar renta puede ayudarte.');
    if (comp) ok.push('Complementar renta aumenta tu capacidad de crédito.');
    if (carga > 0.2) warn.push('Tus deudas ya usan ' + Math.round(carga * 100) + '% de tu renta: reducirlas aumenta tu capacidad.');
    else if (rentaTotal > 0 && val('propiedades')) ok.push('Carga financiera saludable.');
    if (edad >= 60) warn.push('Por edad, el plazo del crédito podría ser menor a 25 años.');
    if (val('ahorro_pie') !== '' && precioUF > 0) {
      if (ahorroUF >= pieUF) ok.push('Tu ahorro cubre el pie estimado.');
      else warn.push('Para el pie te faltarían ≈ ' + ufFmt(pieUF - ahorroUF) + ': muchos proyectos en verde permiten pagarlo en cuotas.');
    }
    if (dividendo <= 0) severo = true;

    var status = document.getElementById('diag-status');
    status.className = 'diag__status ' + (severo ? 'diag__status--risk' : warn.length >= 2 ? 'diag__status--warn' : 'diag__status--ok');
    status.textContent = severo ? 'Requiere revisión' : warn.length >= 2 ? 'Perfil con observaciones' : 'Perfil favorable';

    document.getElementById('diag-precio').textContent = ufFmt(precioUF);
    document.getElementById('diag-precio-clp').textContent = '≈ ' + clp(precioUF * UF);
    document.getElementById('diag-carga-label').textContent = 'Carga financiera actual: ' + Math.round(carga * 100) + '% de tu renta';
    var meter = document.getElementById('diag-meter');
    meter.style.width = Math.min(100, carga / CARGA_MAX * 100) + '%';
    meter.style.backgroundColor = carga <= 0.2 ? '#3DBE7A' : carga <= 0.35 ? '#E0A100' : '#DC0E54';
    document.getElementById('diag-renta').textContent = clp(rentaTotal);
    document.getElementById('diag-div').textContent = clp(dividendo);
    document.getElementById('diag-credito').textContent = ufFmt(creditoUF);
    document.getElementById('diag-pie').textContent = ufFmt(pieUF);
    document.getElementById('diag-ahorro').textContent = ufFmt(ahorroUF);
    document.getElementById('diag-flags').innerHTML =
      ok.map(function (t) { return '<li class="ok">' + t + '</li>'; }).join('') +
      warn.map(function (t) { return '<li class="warn">' + t + '</li>'; }).join('');
    // Proyectos del catálogo que calzan con la capacidad (y con las comunas elegidas, si hay)
    var calzan = proyectosQueCalzan(precioUF);
    document.getElementById('diag-matches').innerHTML = calzan.length
      ? '<div class="diag__label">' + calzan.length + (calzan.length === 1 ? ' proyecto calza' : ' proyectos calzan') + ' con tu capacidad</div>' +
        calzan.slice(0, 3).map(function (p) { return '<a href="' + IMOBU.url(p) + '" target="_blank">' + IMOBU.esc(p.nombre) + '<span>' + ufFmt(p.uf) + '</span></a>'; }).join('')
      : '<div class="diag__label">Por ahora ningún proyecto del catálogo calza con esta estimación. Tu asesor te mostrará alternativas y cómo aumentar tu capacidad.</div>';

    document.getElementById('mini-precio').textContent = ufFmt(precioUF);
    toggleMini(!enviado);
    return { status: status.textContent, precioUF: Math.round(precioUF), creditoUF: Math.round(creditoUF), dividendo: Math.round(dividendo), carga: Math.round(carga * 100) };
  }

  function proyectosQueCalzan(precioUF) {
    var comunas = Array.prototype.map.call(form.querySelectorAll('input[name="comunas"]:checked'), function (c) { return c.value; })
      .filter(function (c) { return c !== 'Me da igual'; });
    // Primero los de las comunas elegidas; dentro de cada grupo, los más cercanos al tope de la capacidad
    return PROYECTOS.filter(function (p) { return p.uf <= precioUF; }).sort(function (a, b) {
      var ca = comunas.indexOf(a.comuna) >= 0 ? 0 : 1, cb = comunas.indexOf(b.comuna) >= 0 ? 0 : 1;
      return ca - cb || b.uf - a.uf;
    });
  }

  function toggleMini(on) {
    mini.classList.toggle('is-visible', on);
    document.body.classList.toggle('has-diag-mini', on);
  }

  // Supuestos visibles, siempre iguales a los que usa el cálculo
  document.getElementById('diag-note').textContent = 'Estimación referencial: dividendo de hasta ' + Math.round(DIV_MAX * 100) +
    '% de la renta líquida, carga financiera total de hasta ' + Math.round(CARGA_MAX * 100) + '%, tasa ' +
    (cfg.TASA_ANUAL * 100).toLocaleString('es-CL') + '% anual, ' + cfg.PLAZO_MESES / 12 + ' años, pie ' + Math.round(PIE * 100) +
    '% y UF de $' + UF.toLocaleString('es-CL') + '. No es una aprobación de crédito: la evaluación formal la realiza tu asesor IMOBU junto a los bancos.';

  // Envío (protegido: ver IMOBU.enviarFormulario en js/imobu.js)
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateStep(current)) return;
    var tel = form.elements.telefono;
    if (!IMOBU.telefonoValido(tel.value)) { goTo(0); tel.style.borderColor = '#C40C4B'; stepError.hidden = false; tel.focus(); return; }
    var prediagnostico = diagnose();
    IMOBU.enviarFormulario(form, 'evaluacion', { prediagnostico: prediagnostico }).then(function () {
      mostrarConfirmacion(prediagnostico);
    }, function (err) {
      stepError.textContent = err.message;
      stepError.hidden = false;
    });
  });

  function mostrarConfirmacion(prediagnostico) {
    var datos = {};
    new FormData(form).forEach(function (v, k) {
      v = IMOBU.limpiar(v, 200);
      if (k === 'comunas') (datos.comunas = datos.comunas || []).push(v);
      else datos[k] = v;
    });
    var asesor = IMOBU.asesor();
    var nombre = datos.nombre || '';
    document.getElementById('done-title').textContent = '¡Gracias, ' + nombre + '! Recibimos tu evaluación.';
    var filas = [
      ['Situación laboral', datos.situacion + ' · ' + datos.antiguedad],
      ['Renta líquida', datos.renta + (datos.complementa === 'si' ? ' + complemento ' + datos.comp_renta : '')],
      ['Ahorro para el pie', datos.ahorro_pie],
      ['Objetivo', datos.objetivo + ' · ' + datos.cantidad + (datos.cantidad === '1' ? ' propiedad' : ' propiedades')],
      ['Comunas de interés', (datos.comunas || ['Sin preferencia']).join(', ')],
      ['Proyecto de interés', datos.proyecto || '—'],
      ['Contacto', datos.canal + (datos.horario ? ' · ' + datos.horario : '')],
      ['Pre-diagnóstico', prediagnostico ? prediagnostico.status + ' · hasta ' + ufFmt(prediagnostico.precioUF) : '—']
    ];
    if (asesor) filas.unshift(['Tu asesor/a', asesor.nombre]);
    document.getElementById('summary').innerHTML = filas.map(function (f) { return '<tr><th>' + f[0] + '</th><td>' + IMOBU.esc(f[1]) + '</td></tr>'; }).join('');
    if (prediagnostico) {
      var sugeridos = proyectosQueCalzan(prediagnostico.precioUF).slice(0, 3);
      if (sugeridos.length) {
        document.getElementById('done-projects').hidden = false;
        document.getElementById('done-list').innerHTML = sugeridos.map(IMOBU.card).join('');
      }
    }
    var msg = 'Hola' + (asesor ? ' ' + asesor.nombre.split(' ')[0] : ' IMOBU') + ', soy ' + nombre + ' ' + (datos.apellido || '') +
      '. Acabo de completar la evaluación de perfil' + (datos.proyecto ? ' y me interesa el ' + datos.proyecto : '') + '.';
    var waDone = document.getElementById('done-wa');
    waDone.href = IMOBU.wa(msg, asesor ? asesor.whatsapp : null);
    if (asesor) { waDone.setAttribute('data-wa-propio', ''); waDone.textContent = 'Escribir a ' + asesor.nombre.split(' ')[0] + ' por WhatsApp'; }
    enviado = true;
    toggleMini(false);

    form.hidden = true;
    document.getElementById('progress').hidden = true;
    var done = document.getElementById('done');
    done.classList.add('is-visible');
    document.getElementById('wizard').scrollIntoView({ block: 'start' });
    done.focus({ preventScroll: true });
  }

  showStep(0);
})();
