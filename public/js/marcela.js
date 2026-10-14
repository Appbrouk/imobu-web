(function () {
  // Datos de la asesora desde js/config.js (editables en intranet.html → Asesores)
  var a = IMOBU.asesorPorId('marcela-diaz') || {};
  document.querySelectorAll('[data-a]').forEach(function (el) { if (a[el.getAttribute('data-a')]) el.textContent = a[el.getAttribute('data-a')]; });
  document.querySelectorAll('[data-a-img]').forEach(function (el) { var v = a[el.getAttribute('data-a-img')]; if (v && /^https:\/\//.test(v)) el.src = v; });
  document.querySelectorAll('[data-a-href]').forEach(function (el) { var v = a[el.getAttribute('data-a-href')]; if (v && /^https:\/\//.test(v)) el.href = v; else if (!v) el.hidden = true; });
  document.querySelectorAll('[data-a-wa]').forEach(function (el) { if (a.whatsapp) el.href = IMOBU.wa(el.getAttribute('data-a-wa'), a.whatsapp); });

  // Links a la evaluación y al catálogo quedan atribuidos a la asesora
  document.querySelectorAll('[data-eval]').forEach(function (el) { el.href = IMOBU.evalUrl(); });
  document.getElementById('m-ver-todos').href = IMOBU.base + 'proyectos.html?asesor=marcela-diaz';

  // Proyectos destacados
  document.getElementById('m-proyectos').innerHTML = PROYECTOS.filter(function (p) { return p.destacado; }).map(IMOBU.card).join('');
  document.getElementById('nota-dividendo').textContent = IMOBU.notaDividendo;

  // Recursos: preselecciona el interés en el formulario
  var form = document.getElementById('m-form');
  document.querySelectorAll('[data-recurso]').forEach(function (b) {
    b.addEventListener('click', function () { form.interes.value = b.getAttribute('data-recurso'); });
  });

  // Registro (protegido: ver IMOBU.enviarFormulario)
  var error = document.getElementById('m-error');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var invalid = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      var bad = !f.checkValidity() || (f.type === 'tel' && !IMOBU.telefonoValido(f.value));
      if (f.type !== 'checkbox') f.style.borderColor = bad ? '#C40C4B' : '';
      return bad;
    });
    if (invalid.length) { error.textContent = 'Revisa los campos marcados.'; error.hidden = false; invalid[0].focus(); return; }
    error.hidden = true;
    IMOBU.enviarFormulario(form, 'registro-asesor').then(function () {
      document.getElementById('m-ok-title').textContent = '¡Gracias, ' + IMOBU.limpiar(form.nombre.value, 80).split(' ')[0] + '!';
      form.style.display = 'none';
      document.getElementById('m-ok').classList.add('is-visible');
    }, function (err) { error.textContent = err.message; error.hidden = false; });
  });
})();
