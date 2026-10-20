import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { renderPage } from './src/content/render';

function content(): Plugin {
  const load = (lang: 'en' | 'ru') => JSON.parse(readFileSync(resolve(__dirname, `src/i18n/${lang}.json`), 'utf8'));
  return {
    name: 'ic-content',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const lang = ctx.path.includes('/ru/') ? 'ru' : 'en';
        const { head, body } = renderPage(load(lang), lang);
        return html.replace('<!--ic:head-->', head).replace('<!--ic:body-->', body);
      },
    },
    handleHotUpdate({ file, server }) {
      if (file.includes('/src/i18n/') || file.includes('/src/content/')) server.ws.send({ type: 'full-reload' });
    },
  };
}

/** three-bvh-csg still passes the deprecated `maxLeafSize` option to three-mesh-bvh (console warning). */
function bvhOptionFix(): Plugin {
  return {
    name: 'ic-bvh-option-fix',
    transform(code, id) {
      if (id.includes('three-bvh-csg') && code.includes('maxLeafSize')) return code.replaceAll('maxLeafSize', 'targetLeafSize');
      return null;
    },
  };
}

export default defineConfig({
  base: '/sites/engines/',
  plugins: [content(), bvhOptionFix()],
  optimizeDeps: { exclude: ['three-bvh-csg'] },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 2048,
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ru: resolve(__dirname, 'ru/index.html'),
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
});
