(function () {
  var root = document.getElementById('pdp-root');
  var p = IMOBU.porId(document.body.getAttribute('data-proyecto') || new URLSearchParams(location.search).get('id'));

  if (!p) {
    document.title = 'Proyecto no encontrado — IMOBU';
    root.innerHTML = '<div class="notfound"><h1>No encontramos este proyecto</h1>' +
      '<p>Puede que ya no esté disponible o que el enlace esté incompleto.</p>' +
      '<a href="' + IMOBU.base + 'proyectos.html" class="btn btn--primary">Ver todos los proyectos</a></div>';
    return;
  }

  var e = IMOBU.esc, ufFmt = IMOBU.uf, clp = IMOBU.clp, cfg = IMOBU.cfg;
  document.title = p.nombre + ' — ' + p.comuna + ' | IMOBU';
  var meta = document.querySelector('meta[name="description"]');
  meta.setAttribute('content', p.nombre + ' en ' + p.comuna + ', de ' + p.inmobiliaria + '. Desde ' + ufFmt(p.uf) + '. Simula tu dividendo y evalúa tu perfil con IMOBU.');

  var tip = IMOBU.tipologia(p.dorm);
  var ideal = [];
  if (p.dorm.indexOf(0) >= 0 || p.dorm.indexOf(1) >= 0) ideal.push('Inversión para arriendo');
  if (p.dorm.indexOf(2) >= 0) ideal.push('Parejas');
  if (p.dorm.indexOf(3) >= 0) ideal.push('Familias');
  var entregaTxt = p.entrega === 'inmediata'
    ? 'Con entrega inmediata: puedes arrendar o habitar apenas se escritura.'
    : 'Con entrega futura: los proyectos en verde o en blanco suelen permitir pagar el pie en cuotas durante la construcción.';
  var waInfo = IMOBU.wa('Hola IMOBU, quiero información del ' + p.nombre + ' en ' + p.comuna + '.');
  var waVisita = IMOBU.wa('Hola IMOBU, quiero agendar una visita al ' + p.nombre + ' en ' + p.comuna + '.');

  root.innerHTML =
    '<div class="breadcrumb" style="padding-top: 40px"><a href="' + IMOBU.base + '">Inicio</a> / <a href="' + IMOBU.base + 'proyectos.html">Proyectos</a> / ' + e(p.nombre) + '</div>' +
    '<div class="pdp">' +
      '<figure class="pdp__media">' +
        '<img src="' + IMOBU.foto(p, 1400) + '" alt="' + e(p.alt) + '">' +
        '<span class="badge' + (p.entrega === 'inmediata' ? ' badge--now' : '') + '">' + (p.entrega === 'inmediata' ? 'Entrega inmediata' : 'Entrega futura') + '</span>' +
      '</figure>' +
      '<div class="pdp__info">' +
        '<div class="project__dev">' + e(p.inmobiliaria) + '</div>' +
        '<h1>' + e(p.nombre) + '</h1>' +
        '<p class="project__place" style="margin: 0">' + IMOBU.icons.pin + e(p.comuna) + '</p>' +
        '<div class="facts">' +
          '<span class="fact">' + IMOBU.icons.bed + tip + '</span>' +
          '<span class="fact">' + IMOBU.icons.area + e(p.m2) + '</span>' +
          '<span class="fact">' + (p.entrega === 'inmediata' ? 'Entrega inmediata' : 'Entrega futura') + '</span>' +
        '</div>' +
        '<p style="margin: 0; font-size: 15px; line-height: 1.6; color: var(--muted)">Departamentos de ' + tip + ' (' + e(p.m2) + ') en ' + e(p.comuna) + ', desarrollados por ' + e(p.inmobiliaria) + '. ' + entregaTxt + '</p>' +
        (ideal.length ? '<p style="margin: 0; font-size: 14px"><strong>Ideal para:</strong> ' + ideal.join(' · ') + '</p>' : '') +
        '<div class="pdp__price">' +
          '<div><div class="price-label">Desde</div><div class="price">' + ufFmt(p.uf) + '</div>' +
          '<div class="project__div">≈ ' + clp(p.uf * cfg.UF) + ' · dividendo ref. ' + clp(IMOBU.dividendoCLP(p.uf)) + '/mes</div></div>' +
        '</div>' +
        '<div class="pdp__actions">' +
          '<a href="' + IMOBU.evalUrl(p) + '" class="btn btn--primary">Evaluarme para este proyecto</a>' +
          '<a href="' + waInfo + '" target="_blank" rel="noopener" class="btn btn--outline">Consultar por WhatsApp</a>' +
          '<a href="' + waVisita + '" target="_blank" rel="noopener" class="link-btn" style="align-self: center">Agendar una visita</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Enlaces con el proyecto ya seleccionado
  ['nav-eval', 'cta-eval', 'r-eval'].forEach(function (id) { document.getElementById(id).href = IMOBU.evalUrl(p); });
  document.getElementById('cta-wa').href = waInfo;
  document.getElementById('wa-float').href = waInfo;

  // Simulador de dividendo
  var sim = document.getElementById('simulador');
  sim.hidden = false;
  var precio = document.getElementById('c-precio');
  var pie = document.getElementById('c-pie');
  precio.min = p.uf;
  precio.max = Math.round(p.uf * 1.8 / 50) * 50;
  precio.value = p.uf;
  document.getElementById('s-min').textContent = ufFmt(p.uf);
  document.getElementById('s-max').textContent = ufFmt(Number(precio.max));
  document.getElementById('r-nota').textContent = 'Estimación referencial con tasa ' + (cfg.TASA_ANUAL * 100).toLocaleString('es-CL') +
    '% anual, sin seguros, con UF de $' + cfg.UF.toLocaleString('es-CL') + '. La renta sugerida considera un dividendo de hasta ' +
    Math.round(cfg.DIV_MAX * 100) + '% de la renta líquida. No constituye oferta ni aprobación de crédito.';

  function simular() {
    var precioUF = Number(precio.value);
    var piePct = Number(pie.value) / 100;
    var meses = Number(sim.querySelector('input[name="plazo"]:checked').value);
    var creditoUF = precioUF * (1 - piePct);
    var divUF = IMOBU.cuotaUF(creditoUF, meses);
    document.getElementById('o-precio').textContent = ufFmt(precioUF);
    document.getElementById('o-pie').textContent = Math.round(piePct * 100) + '%';
    document.getElementById('r-div').textContent = clp(divUF * cfg.UF);
    document.getElementById('r-div-uf').textContent = 'UF ' + divUF.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' al mes · ' + meses / 12 + ' años';
    document.getElementById('r-pie').textContent = ufFmt(precioUF * piePct) + ' · ' + clp(precioUF * piePct * cfg.UF);
    document.getElementById('r-credito').textContent = ufFmt(creditoUF);
    document.getElementById('r-renta').textContent = clp(divUF * cfg.UF / cfg.DIV_MAX);
  }
  sim.addEventListener('input', simular);
  sim.addEventListener('change', simular);
  simular();

  // Proyectos similares: misma comuna primero, luego los de precio más cercano
  var otros = PROYECTOS.filter(function (o) { return o.id !== p.id; })
    .sort(function (a, b) {
      var ca = a.comuna === p.comuna ? 0 : 1, cb = b.comuna === p.comuna ? 0 : 1;
      return ca - cb || Math.abs(a.uf - p.uf) - Math.abs(b.uf - p.uf);
    }).slice(0, 3);
  if (otros.length) {
    document.getElementById('similares').hidden = false;
    document.getElementById('similares-list').innerHTML = otros.map(IMOBU.card).join('');
  }
})();
