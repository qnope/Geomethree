import * as THREE from 'three';
import { TRACK_HALF } from '../game/level';
import type { PropKind, SkylineStyle, Theme } from './themes';

/** Longueur (u) de la tuile d'objets du bord de piste. Deux copies côte à côte, recalées par tuile entière. */
export const PROP_TILE = 120;

const SKY_R = 185;   // dôme du ciel (plan lointain de la caméra : 200)
const SUN_D = 160;   // distance de l'astre
const NEAR_R = 150;  // montagnes proches
const FAR_R = 172;   // montagnes lointaines
const FLOOR = 320;   // côté du sol uni, centré sous la caméra
const GRID = 4;      // pas du quadrillage du sol
const TAU = Math.PI * 2;
const LIGHT = new THREE.Vector3(-4, 10, 8).normalize(); // même direction que la lumière de la scène

/** Pseudo-aléa à graine (mulberry32) : le décor est le même à chaque partie. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string): number => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);

const mix = (a: number | THREE.Color, b: number | THREE.Color, t: number): THREE.Color =>
  new THREE.Color(a).lerp(new THREE.Color(b), t);

/** Accumule des triangles indexés à couleurs de sommets, pour tout fusionner en un seul maillage. */
class Mesher {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(x: number, y: number, z: number, c: THREE.Color): number {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  /** Quadrilatère a-b-c-d (deux triangles). */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    return geo;
  }
}

/** Profil de la ligne d'horizon, de 0 à 1, sur `n` colonnes (colonne 0 = droit devant). */
function profile(style: SkylineStyle, rand: () => number, n: number): Float32Array {
  const h = new Float32Array(n);
  const gap = (a: number, b: number) => {
    const d = Math.abs(a - b) % TAU;
    return d > Math.PI ? TAU - d : d;
  };
  const bumps = (count: number, w0: number, w1: number, h0: number) =>
    Array.from({ length: count }, () => ({ a: rand() * TAU, w: w0 + rand() * (w1 - w0), h: h0 + rand() * (1 - h0) }));
  const phase = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    h[i] = 0.06 + 0.04 * Math.sin(3 * a + phase);
  }
  if (style === 'peaks') {
    const list = bumps(16, 0.12, 0.38, 0.35);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (const p of list) h[i] = Math.max(h[i], p.h * (1 - gap(a, p.a) / p.w));
      // Vallée droit devant, où file la piste ; arêtes rocheuses.
      h[i] *= (0.3 + 0.7 * THREE.MathUtils.smoothstep(gap(a, 0), 0.05, 0.45)) * (0.96 + rand() * 0.04);
    }
  } else if (style === 'mesas') {
    const list = bumps(10, 0.05, 0.2, 0.4);
    list[0].a = 0.3 + rand() * 0.3; // une mesa de chaque côté de la piste
    list[1].a = -0.3 - rand() * 0.3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (const p of list) {
        const d = gap(a, p.a), slope = 0.035;
        if (d < p.w + slope) h[i] = Math.max(h[i], d < p.w ? p.h : p.h * (1 - (d - p.w) / slope) ** 0.6);
      }
    }
  } else if (style === 'volcanoes') {
    const list = bumps(6, 0.22, 0.42, 0.5);
    list[0].a = (rand() - 0.5) * 0.5; // un volcan presque droit devant
    list[0].h = 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (const p of list) {
        const k = 1 - gap(a, p.a) / p.w;
        if (k <= 0) continue;
        const cone = k > 0.86 ? 0.86 - (k - 0.86) * 0.6 : k; // cratère
        h[i] = Math.max(h[i], p.h * cone ** 1.3);
      }
    }
  } else {
    // Lisière de forêt : collines douces hérissées de cimes en dents de scie.
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const hill = 0.35 + 0.15 * Math.sin(2 * a + phase) + 0.1 * Math.sin(5 * a + phase * 2);
      h[i] = hill + (i % 2 === 0 ? 0.2 + rand() * 0.35 : 0);
    }
  }
  return h;
}

/** Deux rangées de montagnes : la lointaine, plus haute, se fond dans la brume de l'horizon. */
function addSkyline(m: Mesher, t: Theme, rand: () => number): void {
  const n = 240, sk = t.skyline;
  const hor = new THREE.Color(t.sky.horizon), c = new THREE.Color();
  for (const layer of [{ r: NEAR_R, haze: 0, scale: 1 }, { r: FAR_R, haze: 0.55, scale: 1.3 }]) {
    const prof = profile(sk.style, rand, n);
    const body = mix(sk.color, hor, layer.haze), rim = mix(sk.top, hor, layer.haze);
    const base = mix(body, hor, 0.55);
    const first = m.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * layer.r, z = Math.sin(a) * layer.r;
      m.vertex(x, -8, z, hor); // juste sous l'horizon : le sol couvre le reste, inutile de le rastériser
      m.vertex(x, 0, z, base);
      m.vertex(x, prof[i] * sk.height * layer.scale, z, c.copy(body).lerp(rim, prof[i] ** 1.5));
      const k = first + i * 3, k2 = first + ((i + 1) % n) * 3;
      m.quad(k, k2, k2 + 1, k + 1);
      m.quad(k + 1, k2 + 1, k2 + 2, k + 2);
    }
  }
}

/** Astre droit devant : disque en tranches horizontales, rayé façon synthwave si demandé. */
function addSun(m: Mesher, t: Theme): void {
  const s = t.sun;
  if (!s) return;
  const top = new THREE.Color(s.top), bot = new THREE.Color(s.bottom), c = new THREE.Color();
  const r = s.radius, S = s.stripes ? 96 : 32;
  const v = (y: number, z: number, u: number) => m.vertex(SUN_D, s.elevation + y, z, c.copy(top).lerp(bot, u));
  for (let j = 0; j < S; j++) {
    const u = (j + 0.5) / S; // 0 en haut, 1 en bas
    if (s.stripes && u > 0.4) {
      const k = (u - 0.4) / 0.07;
      if (k - Math.floor(k) < 0.12 + (u - 0.4) * 0.9) continue; // bandes de plus en plus larges vers le bas
    }
    const ya = r - (j / S) * 2 * r, yb = r - ((j + 1) / S) * 2 * r;
    const wa = Math.sqrt(Math.max(0, r * r - ya * ya)), wb = Math.sqrt(Math.max(0, r * r - yb * yb));
    m.quad(v(ya, -wa, j / S), v(yb, -wb, (j + 1) / S), v(yb, wb, (j + 1) / S), v(ya, wa, j / S));
  }
}

/** Dôme : dégradé horizon → zénith, et halo de l'astre peint directement dans les couleurs de sommets. */
function addDome(m: Mesher, t: Theme): void {
  const W = 40, H = 18, el0 = 0; // sous l'horizon, les montagnes et le sol couvrent tout
  const hor = new THREE.Color(t.sky.horizon), zen = new THREE.Color(t.sky.zenith), c = new THREE.Color();
  const s = t.sun;
  const sunDir = new THREE.Vector3(SUN_D, s?.elevation ?? 0, 0).normalize(), dir = new THREE.Vector3();
  const halo = s ? mix(s.top, s.bottom, 0.5) : hor, spread = s ? (2.2 * s.radius) / SUN_D : 1;
  const first = m.count;
  for (let j = 0; j <= H; j++) {
    const el = el0 + (j / H) * (Math.PI / 2 - el0);
    for (let i = 0; i <= W; i++) {
      const az = (i / W) * TAU;
      dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      c.copy(hor).lerp(zen, Math.sqrt(Math.max(0, dir.y)));
      if (s) c.lerp(halo, 0.55 * Math.exp(-((dir.angleTo(sunDir) / spread) ** 2)));
      m.vertex(dir.x * SKY_R, dir.y * SKY_R, dir.z * SKY_R, c);
      if (i < W && j < H) {
        const k = first + j * (W + 1) + i;
        m.quad(k, k + 1, k + W + 2, k + W + 1);
      }
    }
  }
}

/**
 * Toile de fond en UN maillage opaque : montagnes, puis astre, puis ciel. Dessinée après la piste et le
 * décor proche (renderOrder), elle ne remplit que les pixels encore vides ; dans le maillage, l'ordre des
 * triangles fait que le ciel n'est pas peint derrière l'astre ni derrière les montagnes. Ni transparence,
 * ni surcoût de remplissage.
 */
function backdrop(t: Theme, rand: () => number): THREE.Mesh {
  const m = new Mesher();
  addSkyline(m, t, rand);
  addSun(m, t);
  addDome(m, t);
  const mesh = new THREE.Mesh(m.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mesh.renderOrder = 10;
  return mesh;
}

/** Étoiles fixes sur la voûte, au-dessus de 3° d'élévation, dessinées après la toile de fond. */
function starField(t: Theme, rand: () => number): THREE.Points | null {
  const s = t.stars;
  if (!s) return null;
  const pos = new Float32Array(s.count * 3);
  const sinMin = Math.sin(0.05), r = SKY_R - 5;
  for (let i = 0; i < s.count; i++) {
    const az = rand() * TAU, el = Math.asin(sinMin + rand() * (1 - sinMin));
    pos.set([Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: s.color, size: 2, sizeAttenuation: false, fog: false, depthWrite: false }));
  pts.renderOrder = 11;
  return pts;
}

/** Sol uni (+ quadrillage, + rivières), recalé sous la caméra : une seule couleur, donc aucun saut visible. */
function floor(t: Theme): THREE.Group {
  const g = new THREE.Group();
  // Non éclairé : un plan uni recevrait le même éclairage partout, autant donner directement sa couleur.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR, FLOOR), new THREE.MeshBasicMaterial({ color: t.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = 5; // après la piste, les obstacles et les objets : il ne remplit que ce qu'ils laissent
  g.add(ground);
  const half = FLOOR / 2;
  if (t.groundGrid !== undefined) {
    const pts: number[] = [];
    for (let k = 1; k <= 30; k++) for (const s of [-1, 1]) {
      const z = s * (TRACK_HALF + k * 2);
      pts.push(-half, 0, z, half, 0, z);
    }
    for (let x = -half; x <= half; x += GRID) pts.push(x, 0, TRACK_HALF, x, 0, 80, x, 0, -TRACK_HALF, x, 0, -80);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: t.groundGrid }));
    grid.position.y = 0.02;
    grid.renderOrder = 4;
    g.add(grid);
  }
  if (t.river) {
    const { offset, width } = t.river, z0 = TRACK_HALF + offset, z1 = z0 + width;
    const pts: number[] = [];
    for (const s of [-1, 1]) {
      const a = s * z0, b = s * z1;
      pts.push(-half, 0, a, half, 0, a, half, 0, b, -half, 0, a, half, 0, b, -half, 0, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const river = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: t.river.color, side: THREE.DoubleSide }));
    river.position.y = 0.01;
    river.renderOrder = 4;
    g.add(river);
  }
  return g;
}

/**
 * Fusionne des pièces en une géométrie non indexée, chaque face peinte de sa couleur et de son éclairage
 * (précalculé : lumière principale + ambiante). Rendu ensuite sans éclairage, le moins cher des shaders.
 */
function paint(
  parts: { geo: THREE.BufferGeometry; color: (y: number) => THREE.Color }[],
  light = { ambient: 0.5, diffuse: 0.6 },
): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tint = new THREE.Color();
  for (const { geo, color } of parts) {
    const p = (geo.index ? geo.toNonIndexed() : geo).getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const shade = light.ambient + light.diffuse * Math.max(0, THREE.Triangle.getNormal(a, b, c, n).dot(LIGHT));
      for (const v of [a, b, c]) {
        pos.push(v.x, v.y, v.z);
        tint.copy(color(v.y)).multiplyScalar(shade);
        col.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** Géométrie d'un objet de bord de piste, base en y = 0, environ 1 u de large. */
function propGeometry(kind: PropKind, body: THREE.Color, accent: THREE.Color): THREE.BufferGeometry {
  const flat = (c: THREE.Color) => () => c;
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  switch (kind) {
    case 'pylon': {
      // Colonne néon : sombre en bas, lumineuse en haut, sans ombrage.
      const glow = new THREE.Color();
      return paint(
        [{ geo: at(new THREE.BoxGeometry(0.35, 1, 0.35), 0, 0.5, 0), color: (y) => glow.copy(body).lerp(accent, y ** 3) }],
        { ambient: 1, diffuse: 0 },
      );
    }
    case 'tree': {
      const light = mix(body, 0xffffff, 0.12);
      return paint([
        { geo: at(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 4, 1, true), 0, 0.45, 0), color: flat(accent) },
        { geo: at(new THREE.ConeGeometry(0.85, 1.7, 6, 1, true), 0, 1.55, 0), color: flat(body) },
        { geo: at(new THREE.ConeGeometry(0.62, 1.3, 6, 1, true), 0, 2.3, 0), color: flat(light) },
      ]);
    }
    case 'cactus':
      return paint([
        { geo: at(new THREE.BoxGeometry(0.42, 2.2, 0.42), 0, 1.1, 0), color: flat(body) },
        { geo: at(new THREE.BoxGeometry(0.26, 0.8, 0.26), 0, 1.45, 0.45), color: flat(accent) },
        { geo: at(new THREE.BoxGeometry(0.16, 0.16, 0.3), 0, 1.05, 0.3), color: flat(accent) },
        { geo: at(new THREE.BoxGeometry(0.24, 0.6, 0.24), 0, 1.75, -0.4), color: flat(accent) },
        { geo: at(new THREE.BoxGeometry(0.15, 0.15, 0.28), 0, 1.45, -0.27), color: flat(accent) },
      ]);
    case 'shard': {
      // Glace : très peu d'ombre, comme si la lumière la traversait.
      const tip = new THREE.Color();
      const grad = (y: number) => tip.copy(body).lerp(accent, Math.min(1, Math.max(0, y)));
      const small = new THREE.ConeGeometry(0.3, 0.6, 5, 1, true).rotateZ(-0.5);
      return paint([
        { geo: at(new THREE.ConeGeometry(0.45, 1, 5, 1, true), 0, 0.5, 0), color: grad },
        { geo: at(small, 0.38, 0.22, 0.1), color: grad },
      ], { ambient: 0.85, diffuse: 0.3 });
    }
    case 'rock':
      return paint([{ geo: at(new THREE.IcosahedronGeometry(1, 0), 0, 0.25, 0), color: (y) => (y < -0.2 ? accent : body) }]);
  }
}

/** Objets du bord de piste : une tuile de PROP_TILE, copiée une fois, instanciée en un seul draw call. */
function propField(t: Theme, rand: () => number): THREE.InstancedMesh | null {
  const p = t.props;
  if (!p) return null;
  const geo = propGeometry(p.kind, new THREE.Color(p.color), new THREE.Color(p.accent));
  const perTile = Math.round(PROP_TILE / p.spacing) * 2;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }), perTile * 2);
  const zMin = TRACK_HALF + 2.5 + (t.river ? t.river.offset + t.river.width : 0);
  const o = new THREE.Object3D();
  const placed: { x: number; matrix: THREE.Matrix4; tint: number }[] = [];
  for (let i = 0; i < perTile; i++) {
    const side = i % 2 ? 1 : -1;
    if (p.layout === 'rows') {
      o.position.set(Math.floor(i / 2) * p.spacing, 0, side * (zMin + 0.5));
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 7, 1);
    } else {
      const s = 0.7 + rand() * 0.8;
      o.position.set(rand() * PROP_TILE, 0, side * (zMin + rand() ** 1.6 * 26));
      o.rotation.set(0, rand() * TAU, 0);
      if (p.kind === 'shard') {
        o.rotation.x = (rand() - 0.5) * 0.5;
        o.rotation.z = (rand() - 0.5) * 0.5;
        o.scale.set(s, s * (1.5 + rand() * 3.5), s);
      } else if (p.kind === 'rock') o.scale.set(s * 1.4, s * (0.5 + rand() * 0.6), s * 1.1);
      else o.scale.set(s, s * (0.85 + rand() * 0.5), s);
    }
    o.updateMatrix();
    placed.push({ x: o.position.x, matrix: o.matrix.clone(), tint: 0.8 + rand() * 0.35 });
  }
  // Du plus proche au plus lointain (la caméra avance vers +x) : les objets cachés échouent au test de profondeur.
  placed.sort((a, b) => a.x - b.x);
  const shift = new THREE.Matrix4().makeTranslation(PROP_TILE, 0, 0), m = new THREE.Matrix4(), c = new THREE.Color();
  placed.forEach(({ matrix, tint }, i) => {
    mesh.setMatrixAt(i, matrix);
    mesh.setMatrixAt(i + perTile, m.multiplyMatrices(shift, matrix));
    c.setScalar(tint);
    mesh.setColorAt(i, c);
    mesh.setColorAt(i + perTile, c);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

const PARTICLE_VS = /* glsl */ `
uniform float uTime, uSize, uScale, uFlicker;
uniform vec3 uCenter, uBox, uVel;
uniform vec2 uFog;
attribute float aSeed;
varying float vAlpha;
void main() {
  // Chaque particule boucle dans une boîte centrée devant la caméra : aucun calcul côté CPU.
  vec3 lo = uCenter - 0.5 * uBox;
  vec3 p = lo + mod(position * uBox + uVel * uTime - lo, uBox);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = max(1.0, uSize * uScale / d);
  float twinkle = mix(1.0, 0.35 + 0.65 * abs(sin(uTime * 2.0 + aSeed * 6.2832)), uFlicker);
  vAlpha = twinkle * (1.0 - smoothstep(uFog.x, uFog.y, d));
}`;

const PARTICLE_FS = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = vAlpha * (1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5)));
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

interface ParticleUniforms {
  [k: string]: THREE.IUniform;
  uTime: { value: number };
  uScale: { value: number };
  uCenter: { value: THREE.Vector3 };
}

function particleField(t: Theme, rand: () => number): { points: THREE.Points; uniforms: ParticleUniforms } | null {
  const p = t.particles;
  if (!p) return null;
  const pos = new Float32Array(p.count * 3), seed = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    pos.set([rand(), rand(), rand()], i * 3);
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms: ParticleUniforms = {
    uTime: { value: 0 },
    uScale: { value: 600 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(110, 22, 56) },
    uVel: { value: new THREE.Vector3(...p.velocity) },
    uSize: { value: p.size },
    uFlicker: { value: p.flicker },
    uColor: { value: new THREE.Color(p.color) },
    uFog: { value: new THREE.Vector2(t.fog.near, t.fog.far) },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
  }));
  points.frustumCulled = false; // positions calculées dans le shader
  return { points, uniforms };
}

/**
 * Décor d'un thème, indépendant du niveau : toile de fond et étoiles (à l'infini, suivent la caméra),
 * sol, objets du bord de piste (tuile répétée), particules. Au plus 5 draw calls, rien d'alloué par frame.
 */
export class Decor {
  readonly object = new THREE.Group();
  /** Tout ce qui est « à l'infini » : suit la caméra. */
  readonly sky = new THREE.Group();
  /** Objets du bord de piste : couvrent [props.x, props.x + 2 × PROP_TILE[. */
  readonly props = new THREE.Group();
  private readonly floor: THREE.Group;
  private readonly particles: ParticleUniforms | null = null;
  private readonly starMat: THREE.PointsMaterial | null = null;

  constructor(readonly theme: Theme) {
    const rand = rng(hash(theme.id));
    this.sky.add(backdrop(theme, rand));
    const stars = starField(theme, rand);
    if (stars) {
      this.sky.add(stars);
      this.starMat = stars.material as THREE.PointsMaterial;
    }
    this.floor = floor(theme);
    const field = propField(theme, rand);
    if (field) this.props.add(field);
    this.object.add(this.sky, this.floor, this.props);
    const parts = particleField(theme, rand);
    if (parts) {
      this.object.add(parts.points);
      this.particles = parts.uniforms;
    }
  }

  /** Taille des particules et des étoiles en pixels : à rappeler quand la fenêtre ou le champ de vision change. */
  setViewport(heightPx: number, fovDeg: number, pixelRatio: number): void {
    if (this.particles) this.particles.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    if (this.starMat) this.starMat.size = 1.6 * pixelRatio;
  }

  update(cam: THREE.Vector3, time: number): void {
    this.sky.position.copy(cam);
    this.floor.position.x = Math.floor(cam.x / GRID) * GRID;
    this.props.position.x = Math.floor((cam.x - 10) / PROP_TILE) * PROP_TILE;
    if (this.particles) {
      this.particles.uTime.value = time;
      this.particles.uCenter.value.set(cam.x + 40, 9, cam.z);
    }
  }
}
