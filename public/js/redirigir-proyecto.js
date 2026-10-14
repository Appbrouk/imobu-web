// /proyecto.html?id=x&asesor=y → /proyectos/x.html?asesor=y
var q = new URLSearchParams(location.search), id = q.get('id');
q.delete('id');
location.replace(id ? '/proyectos/' + encodeURIComponent(id) + '.html' + (q.toString() ? '?' + q.toString() : '') : '/proyectos.html');
