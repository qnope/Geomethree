import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Icônes du jeu : favicon (onglet), écran d'accueil iOS, Android et PWA (manifest).
// Elles sont générées depuis icons/icon.svg par `npm run icons` et servies depuis public/.
const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const publicFile = (href: string): string => resolve(root, 'public', href.replace(/^\.?\//, ''));

const tags = (name: string): string[] => [...html.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const links = (rel: string): string[] => tags('link').filter((t) => attr(t, 'rel') === rel);

/** Largeur, hauteur et type de couleur d'un PNG, lus dans son en-tête IHDR. */
const png = (file: string): { width: number; height: number; colorType: number } => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
};

interface ManifestIcon { src: string; sizes: string; type: string; purpose?: string }
const manifestLink = links('manifest')[0];
const manifestPath = manifestLink ? publicFile(attr(manifestLink, 'href')!) : '';
const manifest = (): { [k: string]: unknown; icons: ManifestIcon[] } => JSON.parse(readFileSync(manifestPath, 'utf8'));
const BACKGROUND = '#0b0820'; // fond de la page et du menu

describe('icônes', () => {
  it('onglet : une icône SVG, et un PNG 32×32 pour les navigateurs sans SVG', () => {
    const icons = links('icon');
    const svg = icons.find((t) => attr(t, 'type') === 'image/svg+xml');
    const png32 = icons.find((t) => attr(t, 'sizes') === '32x32');
    expect(svg).toBeDefined();
    expect(png32).toBeDefined();
    expect(existsSync(publicFile(attr(svg!, 'href')!))).toBe(true);
    expect(png(publicFile(attr(png32!, 'href')!))).toMatchObject({ width: 32, height: 32 });
  });

  it('le favicon SVG est la source icons/icon.svg aux coins arrondis (à jour)', () => {
    const svg = links('icon').find((t) => attr(t, 'type') === 'image/svg+xml')!;
    const favicon = readFileSync(publicFile(attr(svg, 'href')!), 'utf8');
    const source = readFileSync(resolve(root, 'icons/icon.svg'), 'utf8');
    const body = (s: string): string =>
      s.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').replace(/>\s+</g, '><').trim();
    expect(favicon).toContain('<clipPath');
    expect(body(favicon)).toContain(body(source));
  });

  it("écran d'accueil iOS : apple-touch-icon 180×180 sans transparence", () => {
    const [touch] = links('apple-touch-icon');
    expect(touch).toBeDefined();
    // iOS remplit la transparence en noir : l'icône doit être opaque (PNG RVB, type 2).
    expect(png(publicFile(attr(touch, 'href')!))).toEqual({ width: 180, height: 180, colorType: 2 });
    const title = tags('meta').find((t) => attr(t, 'name') === 'apple-mobile-web-app-title');
    expect(title && attr(title, 'content')).toBe('Geomethree');
  });

  it('manifest : nom, plein écran, couleurs du jeu', () => {
    expect(manifestLink).toBeDefined();
    const m = manifest();
    expect(m).toMatchObject({
      name: 'Geomethree',
      short_name: 'Geomethree',
      lang: 'fr',
      start_url: './',
      scope: './',
      display: 'fullscreen',
      background_color: BACKGROUND,
      theme_color: BACKGROUND,
    });
    const theme = tags('meta').find((t) => attr(t, 'name') === 'theme-color');
    expect(theme && attr(theme, 'content')).toBe(BACKGROUND);
  });

  it('manifest : icônes Android 192 et 512, plus une 512 « maskable » pour les icônes adaptatives', () => {
    const icons = manifest().icons;
    const has = (sizes: string, purpose: string): boolean =>
      icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any').split(' ').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const i of icons) {
      expect(i.type).toBe('image/png');
      const [w, h] = i.sizes.split('x').map(Number);
      // Chemins relatifs au manifest : le jeu est servi dans un sous-dossier sur GitHub Pages.
      expect(i.src.startsWith('/')).toBe(false);
      const file = resolve(manifestPath, '..', i.src);
      expect(png(file)).toMatchObject({ width: w, height: h });
      // Une icône « maskable » est rognée par Android : elle remplit tout le carré, sans transparence.
      if (i.purpose?.includes('maskable')) expect(png(file).colorType).toBe(2);
    }
  });

  it('poids : favicon chargé avec la page ≤ 4 Ko, toutes les icônes ≤ 200 Ko', () => {
    const icons = links('icon').map((t) => publicFile(attr(t, 'href')!));
    for (const f of icons) expect(statSync(f).size).toBeLessThanOrEqual(4 * 1024);
    const all = [
      ...icons,
      publicFile(attr(links('apple-touch-icon')[0], 'href')!),
      ...manifest().icons.map((i) => resolve(manifestPath, '..', i.src)),
    ];
    const total = [...new Set(all)].reduce((s, f) => s + statSync(f).size, 0);
    expect(total).toBeLessThanOrEqual(200 * 1024);
  });
});
