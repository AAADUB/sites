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

(`scripts/stills.mjs` needs a headless browser driver and an image encoder resolvable from `scripts/`; see its header.)

## QA

Last verification run (local production build, headless browser with a software GL renderer):

- `npm run build` (strict type-check) and `npm test` (32 physics unit tests) pass.
- Lab page audit, mobile EN: performance 98, accessibility 100, best practices 100, SEO 100 (LCP 1.8 s, TBT 10 ms, CLS 0.009). Mobile RU: 99 / 100 / 100 / 100. Desktop EN: 100 / 100 / 100 / 100 (CLS 0.013).
- Initial JavaScript: about 63 KB gzipped; the 3D bundle (about 266 KB gzipped) loads only once the reader interacts.
- No horizontal overflow and no element outside the viewport at 320×568, 375×667, 390×844, 414×896, 844×390, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440, 3840×2160 and 1440×900 at 200 % zoom.
- Keyboard: about 160 focus stops in reading order (EN and RU), every one named and visibly focused.
- Every section reviewed screen by screen in English and Russian at 1440×900 and on a 390×844 phone, with the 3D scenes running; tools, games, quiz, glossary search, pop-up definitions, settings and the no-WebGL fallback exercised.

Posters are re-rendered with `node scripts/stills.mjs` against a local preview build.
