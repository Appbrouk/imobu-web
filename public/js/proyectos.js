(function () {
  var catalog = document.getElementById('catalog');
  var form = document.getElementById('filters');
  var count = document.getElementById('results-count');
  var empty = document.getElementById('empty-state');
  var mas = document.getElementById('catalogo-mas'), masBtn = document.getElementById('catalogo-mas-btn'), masNota = document.getElementById('catalogo-mas-nota');
  var PAGINA = 12;          // 3 filas de 4 tarjetas
  var visibles = PAGINA;
  var plano = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
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
  ['q', 'comuna', 'precio', 'entrega', 'dorm', 'orden'].forEach(function (k) {
    if (params.get(k) !== null) form[k].value = params.get(k);
  });
  // Rangos antiguos de precio que llegan por enlaces (p. ej. 0-3000 desde el inicio)
  if (params.get('precio') && !form.precio.value) { var r0 = params.get('precio').split('-').map(Number); form.precio.value = r0[0] === 0 ? '0-2500' : r0[0] >= 5000 ? '5000-999999' : r0[0] >= 3500 ? '3500-5000' : '2500-3500'; }

  function render() {
    var f = { q: form.q.value.trim(), comuna: form.comuna.value, precio: form.precio.value, entrega: form.entrega.value, dorm: form.dorm.value, orden: form.orden.value };
    var texto = plano(f.q);
    var list = PROYECTOS.filter(function (p) {
      if (texto && plano([p.nombre, p.comuna, p.inmobiliaria, p.resumen].join(' ')).indexOf(texto) < 0) return false;
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
    var mostrados = list.slice(0, visibles);
    catalog.innerHTML = mostrados.map(IMOBU.card).join('');
    empty.classList.toggle('is-visible', list.length === 0);
    count.innerHTML = list.length === PROYECTOS.length
      ? '<strong>' + list.length + ' proyectos</strong>'
      : '<strong>' + list.length + ' de ' + PROYECTOS.length + '</strong> proyectos coinciden con tu búsqueda';
    if (mas) {
      mas.hidden = list.length <= visibles;
      if (masNota) masNota.textContent = 'Mostrando ' + mostrados.length + ' de ' + list.length;
    }
    // La URL refleja los filtros: se puede compartir o volver atrás sin perderlos
    var q = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k] && !(k === 'orden' && f[k] === 'destacados')) q.set(k, f[k]); });
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
  }

  function reiniciar() { visibles = PAGINA; render(); }
  form.addEventListener('change', reiniciar);
  var tQ = 0;
  form.q.addEventListener('input', function () { clearTimeout(tQ); tQ = setTimeout(reiniciar, 180); });
  form.addEventListener('submit', function (e) { e.preventDefault(); reiniciar(); });
  document.getElementById('clear-filters').addEventListener('click', function () { form.reset(); reiniciar(); });
  if (masBtn) masBtn.addEventListener('click', function () {
    var antes = catalog.children.length;
    visibles += PAGINA; render();
    var nueva = catalog.children[antes];
    if (nueva) { var a = nueva.querySelector('h3 a'); if (a) a.focus({ preventScroll: true }); }
  });
  render();
})();
