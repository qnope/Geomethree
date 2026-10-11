import type { ObstacleType } from '../game/level';

/**
 * Décors (thèmes visuels) : uniquement des couleurs et des paramètres de génération, aucune texture.
 * Le niveau ne change pas : il ne nomme que des types d'obstacles, que chaque décor habille à sa façon.
 * On choisit le décor d'un niveau dans `levels.ts`.
 * Ajouter un décor = ajouter une entrée ici et son identifiant à `ThemeId`.
 */

export type ThemeId = 'neon' | 'foret' | 'dunes' | 'glacier' | 'volcan';

/** Silhouette de l'horizon, générée procéduralement. */
export type SkylineStyle = 'peaks' | 'mesas' | 'volcanoes' | 'trees';

/** Forme dessinée dans la case d'un obstacle, sans en déborder (voir `obstacles.ts`). */
export const OBSTACLE_SHAPES = ['box', 'hex', 'octo', 'round', 'pyramid', 'cone', 'crystal', 'cluster'] as const;
export type ObstacleShape = (typeof OBSTACLE_SHAPES)[number];

/** Habillage d'un type d'obstacle dans un décor. */
export interface ObstacleStyle {
  shape: ObstacleShape;
  color: number;
  emissive?: number;
  glow?: number;
  /** Couleur des arêtes ; pas d'arêtes si absente. */
  edges?: number;
  /** Arêtes du dessus répétées à chaque unité de hauteur : strates, briques, marches. */
  layers?: boolean;
}

/** Objets posés au bord de la piste (instanciés : 1 draw call). */
export type PropKind = 'pylon' | 'tree' | 'cactus' | 'shard' | 'rock';

export interface Theme {
  id: ThemeId;
  name: string;
  /** Dégradé du ciel. Le brouillard prend la couleur de l'horizon, pour qu'on ne voie pas la fin du sol. */
  sky: { zenith: number; horizon: number };
  fog: { near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  light: { color: number; intensity: number };
  ground: number;
  /** Quadrillage lumineux sur le sol, de part et d'autre de la piste. */
  groundGrid?: number;
  /** Bandes le long de la piste (lave, eau…), à `offset` du bord et larges de `width`. */
  river?: { color: number; offset: number; width: number };
  track: { color: number; lanes: number; rails: number };
  /** Rendu de chaque type d'obstacle. Même forme de collision dans tous les décors. */
  obstacles: Record<ObstacleType, ObstacleStyle>;
  player: { color: number; emissive: number; edges: number };
  finish: number;
  /** Astre droit devant (soleil, lune) : rayon et hauteur en unités à 160 u, rayures façon synthwave. */
  sun?: { top: number; bottom: number; radius: number; elevation: number; stripes?: boolean };
  stars?: { color: number; count: number };
  /** Montagnes à l'horizon : `top` colore les sommets (neige, lueur…). */
  skyline: { style: SkylineStyle; color: number; top: number; height: number };
  /** `rows` : alignés le long de la piste ; `scatter` : semés au hasard. `spacing` : un objet tous les… (u, par côté). */
  props?: { kind: PropKind; color: number; accent: number; spacing: number; layout: 'rows' | 'scatter' };
  /** Particules (neige, braises, pollen…) animées entièrement par le GPU. `velocity` en u/s. */
  particles?: { color: number; count: number; size: number; velocity: readonly [number, number, number]; flicker: number };
}

export const THEMES: readonly Theme[] = [
  {
    id: 'neon',
    name: 'Néon',
    sky: { zenith: 0x05021a, horizon: 0x3d0b52 },
    fog: { near: 35, far: 95 },
    hemi: { sky: 0x9fb4ff, ground: 0x220033, intensity: 1.2 },
    light: { color: 0xffffff, intensity: 1.6 },
    ground: 0x0b0620,
    groundGrid: 0xc21fb0,
    track: { color: 0x241567, lanes: 0x4a2fd0, rails: 0x33ddff },
    obstacles: {
      wall: { shape: 'box', color: 0x6a4cff, emissive: 0x4a2fd0, glow: 0.6, edges: 0xd8ccff },
      ramp: { shape: 'box', color: 0x18d6a0, emissive: 0x08805a, glow: 0.5, edges: 0xb0ffe6 },
      stairs: { shape: 'box', color: 0xc04cff, emissive: 0x7a1fd0, glow: 0.5, edges: 0xffc8ff, layers: true },
      pyramid: { shape: 'pyramid', color: 0xff3d7f, emissive: 0xff1a5e, glow: 0.8 },
    },
    player: { color: 0x33ddff, emissive: 0x0a6a88, edges: 0xffffff },
    finish: 0x66ff99,
    sun: { top: 0xffe066, bottom: 0xff2bd6, radius: 24, elevation: 12, stripes: true },
    stars: { color: 0xffffff, count: 260 },
    skyline: { style: 'peaks', color: 0x14052e, top: 0xff2bd6, height: 18 },
    props: { kind: 'pylon', color: 0x120830, accent: 0x33ddff, spacing: 10, layout: 'rows' },
  },
  {
    id: 'foret',
    name: 'Forêt',
    sky: { zenith: 0x2b7a8c, horizon: 0xcfe8b0 },
    fog: { near: 25, far: 85 },
    hemi: { sky: 0xe6ffd0, ground: 0x2d4a1e, intensity: 1.1 },
    light: { color: 0xfff2c4, intensity: 1.5 },
    ground: 0x3d7a35,
    track: { color: 0x7a5533, lanes: 0x5e3f24, rails: 0xe8d28a },
    obstacles: {
      wall: { shape: 'round', color: 0x3d2614, edges: 0xe0c08f }, // troncs
      ramp: { shape: 'box', color: 0xd9a066, edges: 0x5e3f24 }, // planches
      stairs: { shape: 'octo', color: 0x8a9a78, edges: 0x3a4a2a, layers: true }, // pierres moussues
      pyramid: { shape: 'cluster', color: 0xffb703, emissive: 0xff7b00, glow: 0.4 }, // ronces
    },
    player: { color: 0x33ddff, emissive: 0x0a6a88, edges: 0xffffff },
    finish: 0xfff3a0,
    sun: { top: 0xfffbe6, bottom: 0xffe08a, radius: 13, elevation: 20 },
    skyline: { style: 'trees', color: 0x2f6b3f, top: 0x4f9a5a, height: 14 },
    props: { kind: 'tree', color: 0x24592f, accent: 0x5a3b22, spacing: 3, layout: 'scatter' },
    particles: { color: 0xfff7b0, count: 260, size: 0.22, velocity: [-0.6, 0.35, 0.2], flicker: 1 },
  },
  {
    id: 'dunes',
    name: 'Dunes',
    sky: { zenith: 0x3a2c78, horizon: 0xff9e5e },
    fog: { near: 30, far: 100 },
    hemi: { sky: 0xffd2a8, ground: 0x6b3a2a, intensity: 1.0 },
    light: { color: 0xffb070, intensity: 1.8 },
    ground: 0xd99a5b,
    track: { color: 0xa8553a, lanes: 0x7d3a26, rails: 0xffe2b0 },
    obstacles: {
      wall: { shape: 'box', color: 0xf0c987, emissive: 0x5a2a10, glow: 0.2, edges: 0x7a3e1d, layers: true }, // grès en strates
      ramp: { shape: 'box', color: 0xe8a25a, edges: 0x7a3e1d },
      stairs: { shape: 'box', color: 0xfff0d0, edges: 0x9a6a3a, layers: true }, // calcaire
      pyramid: { shape: 'pyramid', color: 0x2b1b4a, emissive: 0x7a3cff, glow: 0.35 }, // obsidienne
    },
    player: { color: 0x33ddff, emissive: 0x0a6a88, edges: 0xffffff },
    finish: 0x66ff99,
    sun: { top: 0xfff1a8, bottom: 0xff6a3d, radius: 30, elevation: 4 },
    stars: { color: 0xffe8ff, count: 90 },
    skyline: { style: 'mesas', color: 0x7a3b4a, top: 0xb85a4a, height: 14 },
    props: { kind: 'cactus', color: 0x3f7d4a, accent: 0x2f6a3c, spacing: 7, layout: 'scatter' },
    particles: { color: 0xffe0b0, count: 200, size: 0.16, velocity: [-1.5, 0.1, 0.6], flicker: 0 },
  },
  {
    id: 'glacier',
    name: 'Glacier',
    sky: { zenith: 0x3f7fd0, horizon: 0xe4f4ff },
    fog: { near: 25, far: 80 },
    hemi: { sky: 0xffffff, ground: 0x8fb8d8, intensity: 1.3 },
    light: { color: 0xffffff, intensity: 1.3 },
    ground: 0xf4f9ff,
    track: { color: 0xcfe8f7, lanes: 0xa9d6f0, rails: 0x2e9bd6 },
    obstacles: {
      wall: { shape: 'hex', color: 0x4fa8e0, emissive: 0x1a6fa8, glow: 0.35, edges: 0xffffff }, // colonnes de glace
      ramp: { shape: 'box', color: 0x2f7fc4, edges: 0xdff4ff },
      stairs: { shape: 'box', color: 0x5cb8e8, edges: 0xffffff, layers: true }, // blocs de glace
      pyramid: { shape: 'crystal', color: 0xc81d4e, emissive: 0x8a0020, glow: 0.3 },
    },
    player: { color: 0xff6a00, emissive: 0x7a2a00, edges: 0xffffff },
    finish: 0x2ee6a0,
    sun: { top: 0xffffff, bottom: 0xdff2ff, radius: 11, elevation: 22 },
    skyline: { style: 'peaks', color: 0x8fb3d9, top: 0xffffff, height: 28 },
    props: { kind: 'shard', color: 0xbfe6ff, accent: 0xffffff, spacing: 3, layout: 'scatter' },
    particles: { color: 0xffffff, count: 600, size: 0.13, velocity: [-0.4, -1.6, 0.3], flicker: 0 },
  },
  {
    id: 'volcan',
    name: 'Volcan',
    sky: { zenith: 0x0d0202, horizon: 0x5c1408 },
    fog: { near: 25, far: 85 },
    hemi: { sky: 0xff8a5c, ground: 0x1a0505, intensity: 0.9 },
    light: { color: 0xffb38a, intensity: 1.3 },
    ground: 0x1c1412,
    river: { color: 0xff4d00, offset: 1.5, width: 3 },
    track: { color: 0x2e2220, lanes: 0x8a2a10, rails: 0xff7a1a },
    obstacles: {
      wall: { shape: 'hex', color: 0x55504f, edges: 0xff8a3d, layers: true }, // orgues basaltiques
      ramp: { shape: 'box', color: 0x8a5a48, emissive: 0xff5a1a, glow: 0.2, edges: 0xffb02e },
      stairs: { shape: 'box', color: 0x7d6a64, emissive: 0xff3d00, glow: 0.15, edges: 0xff7a2a, layers: true }, // lave refroidie
      pyramid: { shape: 'crystal', color: 0xffc21a, emissive: 0xff8800, glow: 0.8 },
    },
    player: { color: 0x33ddff, emissive: 0x0a6a88, edges: 0xffffff },
    finish: 0x66ff99,
    sun: { top: 0xff5a2a, bottom: 0x8a0f00, radius: 22, elevation: 12 },
    skyline: { style: 'volcanoes', color: 0x1a0605, top: 0xff4a10, height: 24 },
    props: { kind: 'rock', color: 0x2a1d1a, accent: 0x5a2a1a, spacing: 3, layout: 'scatter' },
    particles: { color: 0xff8a2a, count: 350, size: 0.16, velocity: [-0.5, 2.0, 0.2], flicker: 1 },
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function themeById(id: ThemeId): Theme {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Décor inconnu « ${id} »`);
  return t;
}

/** `?theme=glacier` dans l'URL : ce décor sur tous les niveaux (aperçu). `null` : chaque niveau garde le sien. */
export function themeParam(search: string): ThemeId | null {
  const wanted = new URLSearchParams(search).get('theme');
  return wanted && BY_ID.has(wanted as ThemeId) ? (wanted as ThemeId) : null;
}
