# Inside Combustion

An interactive, visual explainer of how internal combustion engines work — four-stroke petrol, diesel, two-stroke and Wankel — for readers aged 10 and up, with deeper layers for engineers.

- English: https://aaadub.github.io/sites/engines/
- Russian: https://aaadub.github.io/sites/engines/ru/

## Develop

```sh
npm ci
npm run dev      # http://localhost:5173/sites/engines/
npm test         # physics tests (Vitest)
npm run build    # type-check + production build into dist/
```

Content lives in `src/i18n/en.json` and `src/i18n/ru.json` and is rendered into static HTML at build time (`src/content/render.ts`). The 3D scenes, physics and tools are in `src/engines`, `src/physics`, `src/sections` and `src/ui`.

Poster stills and Open Graph images are rendered from the live scenes:

```sh
npm run build && npx vite preview --port 4173 &
node scripts/stills.mjs http://localhost:4173/sites/engines/
```

(`scripts/stills.mjs` needs `playwright`, `@sparticuz/chromium` and `sharp` installed next to it.)

## QA

See the QA section at the end of this file after each verification run.
