(function () {
  // Proyectos destacados (desde js/imobu.js)
  document.getElementById('project-list').innerHTML = PROYECTOS.filter(function (p) { return p.destacado; }).map(IMOBU.card).join('');
  document.getElementById('nota-dividendo').textContent = IMOBU.notaDividendo;

  // Link activo según sección visible
  // data-section permite que un link a otra página (Proyectos, Sé broker) se marque con su sección del home
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  var sectionId = function (a) { return a.dataset.section || a.getAttribute('href').slice(1); };
  var sections = links.map(function (a) { return document.getElementById(sectionId(a)); });
  function setActive(id) {
    links.forEach(function (a) { a.classList.toggle('is-active', sectionId(a) === id); });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { if (s) io.observe(s); });
  }
  // El footer (#contacto) es bajo y nunca cruza la mitad de la pantalla: se marca al llegar al final
  window.addEventListener('scroll', function () {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive('contacto');
  }, { passive: true });

  // El buscador lleva al catálogo completo con los filtros elegidos
  var searchForm = document.getElementById('search-form');
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = new URLSearchParams();
    ['comuna', 'precio', 'entrega'].forEach(function (k) { if (searchForm[k].value) q.set(k, searchForm[k].value); });
    location.href = 'proyectos.html' + (q.toString() ? '?' + q.toString() : '');
  });

  // Formulario "Te llamamos" (protegido y enviado por IMOBU.enviarFormulario, ver js/imobu.js)
  var form = document.getElementById('eval-form');
  var error = document.getElementById('form-error');
  var errorTexto = error.textContent;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var invalid = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      var bad = !f.checkValidity() || (f.type === 'tel' && !IMOBU.telefonoValido(f.value));
      if (f.type !== 'checkbox') f.style.borderColor = bad ? '#C40C4B' : '';
      return bad;
    });
    if (invalid.length) {
      error.textContent = errorTexto;
      error.hidden = false;
      invalid[0].focus();
      return;
    }
    error.hidden = true;
    IMOBU.enviarFormulario(form, 'contacto').then(function () {
      var nombre = IMOBU.limpiar(form.nombre.value, 80);
      document.getElementById('success-title').textContent = '¡Gracias, ' + nombre.split(' ')[0] + '!';
      document.getElementById('wa-followup').href = IMOBU.wa('Hola IMOBU, soy ' + nombre + '. Dejé mis datos en la web y quiero agendar una asesoría.');
      form.style.display = 'none';
      document.getElementById('eval-success').classList.add('is-visible');
    }, function (err) {
      error.textContent = err.message;
      error.hidden = false;
    });
  });
})();
