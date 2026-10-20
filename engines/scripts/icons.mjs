// Rasterise the SVG favicon into the PNG sizes browsers and the web manifest need.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'public/favicon.svg'));
const out = (n) => resolve(root, 'public', n);
await sharp(svg, { density: 300 }).resize(32, 32).png().toFile(out('favicon-32.png'));
await sharp(svg, { density: 600 }).resize(180, 180).flatten({ background: '#0e1014' }).png().toFile(out('apple-touch-icon.png'));
await sharp(svg, { density: 600 }).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg, { density: 600 }).resize(512, 512).png().toFile(out('icon-512.png'));
console.log('icons ok');
