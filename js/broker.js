(function () {
  // Simulador de ingresos
  // Comisión del broker sobre el valor de la unidad: se ajusta en intranet.html (brokers.comisionPct)
  var COMISION = IMOBU.cfg.COMISION;
  // Valor UF referencial: se ajusta en js/imobu.js (IMOBU.cfg.UF)
  var valorUF = IMOBU.cfg.UF;
  var ventas = document.getElementById('sim-ventas');
  var uf = document.getElementById('sim-uf');
  var clp = function (n) { return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-CL'); };
  var ufFmt = function (n) { return 'UF ' + n.toLocaleString('es-CL', { maximumFractionDigits: 1 }); };

  function simular() {
    var v = Number(ventas.value);
    var porVentaUF = Number(uf.value) * COMISION;
    var mesUF = porVentaUF * v;
    document.getElementById('out-ventas').textContent = v + (v === 1 ? ' venta' : ' ventas');
    document.getElementById('out-uf').textContent = ufFmt(Number(uf.value));
    document.getElementById('out-pct').textContent = (COMISION * 100).toLocaleString('es-CL') + '%';
    document.getElementById('res-mes').textContent = clp(mesUF * valorUF);
    document.getElementById('res-mes-uf').textContent = ufFmt(mesUF) + ' · UF referencial $' + valorUF.toLocaleString('es-CL', { maximumFractionDigits: 2 });
    document.getElementById('res-venta').textContent = clp(porVentaUF * valorUF);
    document.getElementById('res-anual').textContent = clp(mesUF * valorUF * 12);
  }
  ventas.addEventListener('input', simular);
  uf.addEventListener('input', simular);
  simular();

  // Formulario de postulación
  var form = document.getElementById('broker-form');
  var error = document.getElementById('form-error');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var invalid = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      var bad = !f.checkValidity() || (f.type === 'tel' && !IMOBU.telefonoValido(f.value));
      if (f.type !== 'radio' && f.type !== 'checkbox') f.style.borderColor = bad ? '#C40C4B' : '';
      return bad;
    });
    if (invalid.length) {
      error.hidden = false;
      invalid[0].focus();
      return;
    }
    error.hidden = true;
    // Envío protegido (ver js/imobu.js)
    IMOBU.enviarFormulario(form, 'postulacion-broker').then(function () {
      var nombre = IMOBU.limpiar(form.nombre.value, 80);
      document.getElementById('success-title').textContent = '¡Gracias, ' + nombre.split(' ')[0] + '!';
      document.getElementById('wa-followup').href = IMOBU.wa('Hola IMOBU, soy ' + nombre + ' y acabo de postular al Programa Brokers.');
      form.style.display = 'none';
      document.getElementById('broker-success').classList.add('is-visible');
    }, function (err) {
      error.textContent = err.message;
      error.hidden = false;
    });
  });
})();
