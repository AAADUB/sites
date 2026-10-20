/**
 * Renders poster stills (WebGL-off fallback and loading posters) and Open Graph images
 * from the real 3D scenes, using a headless browser against a local preview build.
 *   node scripts/stills.mjs http://localhost:4173/sites/engines/ [ids...]
 * Requires playwright, @sparticuz/chromium and sharp to be resolvable (NODE_PATH).
 */
import { chromium } from 'playwright';
import sc from '@sparticuz/chromium';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://localhost:4173/sites/engines/';
const only = process.argv.slice(3);
const STAGES = ['hero', 'bigIdea', 'anatomy', 'fourStroke', 'diesel', 'twoStroke', 'wankel', 'layouts', 'systems', 'compare'];
const outDir = resolve(root, 'public/stills');
mkdirSync(outDir, { recursive: true });

const exe = await sc.executablePath();

// one browser per shot keeps the software renderer's memory in check
async function shot(url, w, h, dpr, waitSel) {
  const browser = await chromium.launch({
    executablePath: exe,
    args: [...sc.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    // the web-font kit is only served to the live domains; posters use the fallback faces
    await page.route(/typekit\.net/, (r) => r.abort());
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(waitSel, { timeout: 360000 });
    await page.waitForTimeout(3500);
    return await page.screenshot({ type: 'png', timeout: 480000 });
  } finally {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]).catch(() => {});
    browser.process?.()?.kill('SIGKILL');
  }
}

for (const id of STAGES) {
  if (only.length && !only.includes(id)) continue;
  const isHero = id === 'hero';
  const w = 1600;
  const h = isHero ? 1000 : 1100;
  const png = await shot(`${base}?capture=${id}`, w, h, isHero ? 1.5 : 1, `[data-stage="${id}"].is-live`);
  const img = sharp(png);
  await img.clone().resize(1600).webp({ quality: 78, effort: 6 }).toFile(resolve(outDir, `${id}.webp`));
  await img.clone().resize(800).webp({ quality: 74, effort: 6 }).toFile(resolve(outDir, `${id}-800.webp`));
  if (isHero) await img.clone().resize(2400).webp({ quality: 78, effort: 6 }).toFile(resolve(outDir, `${id}-2400.webp`));
  console.log('still', id);
}

// portrait hero for phones, so the poster matches the live layout there
if (!only.length || only.includes('hero-m')) {
  const png = await shot(`${base}?capture=hero`, 430, 932, 2, '[data-stage="hero"].is-live');
  const img = sharp(png);
  await img.clone().resize(860).webp({ quality: 76, effort: 6 }).toFile(resolve(outDir, 'hero-m.webp'));
  await img.clone().resize(560).webp({ quality: 74, effort: 6 }).toFile(resolve(outDir, 'hero-m-560.webp'));
  console.log('still hero-m');
}

if (!only.length || only.includes('og')) {
  for (const lang of ['en', 'ru']) {
    const url = `${base}${lang === 'ru' ? 'ru/' : ''}?capture=og`;
    const png = await shot(url, 1200, 630, 1, '[data-stage="hero"].is-live');
    await sharp(png).png({ compressionLevel: 9, palette: false }).toFile(resolve(root, `public/og-${lang}.png`));
    console.log('og', lang);
  }
}
process.exit(0);
