import { defineConfig } from 'astro/config';

// format 'file' conserva las URLs actuales (/proyectos.html) y crea /proyectos/<id>.html por proyecto.
export default defineConfig({
  site: 'https://imobu.cl',
  build: { format: 'file', inlineStylesheets: 'never' }
});
