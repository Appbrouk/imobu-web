(function () {
  var catalog = document.getElementById('catalog');
  var form = document.getElementById('filters');
  var count = document.getElementById('results-count');
  var empty = document.getElementById('empty-state');
  document.getElementById('nota-dividendo').textContent = IMOBU.notaDividendo;

  // Opciones de comuna a partir de los datos
  PROYECTOS.map(function (p) { return p.comuna; })
    .filter(function (c, i, a) { return a.indexOf(c) === i; })
    .sort(function (a, b) { return a.localeCompare(b, 'es'); })
    .forEach(function (c) {
      var o = document.createElement('option'); o.textContent = c; o.value = c; form.comuna.appendChild(o);
    });

  // Filtros que llegan por URL (?comuna=&precio=&entrega=&dorm=), p. ej. desde el buscador del home
  var params = new URLSearchParams(location.search);
  ['comuna', 'precio', 'entrega', 'dorm', 'orden'].forEach(function (k) {
    if (params.get(k) !== null) form[k].value = params.get(k);
  });

  function render() {
    var f = { comuna: form.comuna.value, precio: form.precio.value, entrega: form.entrega.value, dorm: form.dorm.value, orden: form.orden.value };
    var list = PROYECTOS.filter(function (p) {
      if (f.comuna && p.comuna !== f.comuna) return false;
      if (f.entrega && p.entrega !== f.entrega) return false;
      if (f.dorm !== '' && p.dorm.indexOf(Number(f.dorm)) < 0) return false;
      if (f.precio) {
        var r = f.precio.split('-').map(Number);
        if (p.uf < r[0] || p.uf > r[1]) return false;
      }
      return true;
    });
    if (f.orden === 'precio-asc') list.sort(function (a, b) { return a.uf - b.uf; });
    if (f.orden === 'precio-desc') list.sort(function (a, b) { return b.uf - a.uf; });
    catalog.innerHTML = list.map(IMOBU.card).join('');
    empty.classList.toggle('is-visible', list.length === 0);
    count.innerHTML = list.length === PROYECTOS.length
      ? 'Mostrando <strong>' + list.length + ' proyectos</strong>'
      : '<strong>' + list.length + ' de ' + PROYECTOS.length + '</strong> proyectos coinciden con tu búsqueda';
    // La URL refleja los filtros: se puede compartir o volver atrás sin perderlos
    var q = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] && !(k === 'orden' && f[k] === 'destacados')) q.set(k, f[k]); });
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
  }

  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  document.getElementById('clear-filters').addEventListener('click', function () { form.reset(); render(); });
  render();
})();
