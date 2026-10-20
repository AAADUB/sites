import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { renderPage } from './src/content/render';

/** Typographic non-breaking spaces: no line may start with a dash, and Russian short words stay with the next word. */
function typo<T>(v: T, lang: 'en' | 'ru'): T {
  if (typeof v === 'string') {
    let s = v.replace(/ — /g, '\u00A0— ');
    if (lang === 'ru') {
      s = s.replace(/(?<=^|[\s(«„])(в|во|и|с|со|к|ко|а|о|об|у|я|на|не|ни|за|по|до|от|из|но|или|без|для|при|про)\s/giu, '$1\u00A0');
    }
    return s as T;
  }
  if (Array.isArray(v)) return v.map((x) => typo(x, lang)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typo(x, lang)])) as T;
  return v;
}

function content(): Plugin {
  const load = (lang: 'en' | 'ru') => typo(JSON.parse(readFileSync(resolve(__dirname, `src/i18n/${lang}.json`), 'utf8')), lang);
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
