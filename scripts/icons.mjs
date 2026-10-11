// Génère toutes les icônes du jeu dans public/ à partir de icons/icon.svg : `npm run icons`.
// Le rendu passe par Chromium (playwright-core) : Chrome installé, ou CHROME_PATH=/chemin/vers/chrome.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SIZE = 512;
const RADIUS = 112; // coins arrondis de l'onglet et des icônes Android « any »

const source = readFileSync('icons/icon.svg', 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/>\s+</g, '><')
  .trim();
// Même dessin, rogné aux coins arrondis.
const rounded = source
  .replace(/^(<svg[^>]*>)/, `$1<clipPath id="coins"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}"/></clipPath><g clip-path="url(#coins)">`)
  .replace(/<\/svg>$/, '</g></svg>');

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', rounded + '\n');

const executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
const page = await browser.newPage();

/** `opaque` : carré plein, PNG RVB sans transparence (iOS, Android « maskable »). */
async function png(file, size, svg, opaque) {
  await page.setViewportSize({ width: size, height: size });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${src}" width="${size}" height="${size}">`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: file, omitBackground: !opaque });
  console.log(file);
}

await png('public/favicon-32.png', 32, rounded, false);
await png('public/apple-touch-icon.png', 180, source, true);
await png('public/icons/icon-192.png', 192, rounded, false);
await png('public/icons/icon-512.png', 512, rounded, false);
await png('public/icons/maskable-512.png', 512, source, true);
await browser.close();
