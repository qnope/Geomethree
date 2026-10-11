import * as THREE from 'three';
import { OBSTACLE_TYPES, type Level, type Obstacle } from '../game/level';
import { moverZ } from '../game/game';
import type { ObstacleShape, Theme } from './themes';

/**
 * Rendu des obstacles : le niveau ne donne que des types (mur, rampe…) et leurs cases de collision,
 * le décor choisit la forme, les couleurs et les arêtes de chaque type.
 * Chaque forme est dessinée dans une case unité (x et z dans [-0,5 ; 0,5], y dans [0 ; 1]),
 * puis étirée à la taille de l'obstacle : le rendu ne déborde jamais de la collision.
 * Un maillage instancié par type présent, plus une seule géométrie pour toutes les arêtes.
 * Les mobiles roulent sur leur rail : `update` les replace à chaque frame, sans rien allouer.
 */

type Profile = readonly (readonly [radius: number, y: number])[];

interface LatheOptions {
  /** Angle du premier sommet : tourne la forme pour que ses faces soient alignées sur la piste. */
  phase?: number;
  /** Normales lissées autour de l'axe (tronc rond) plutôt que des facettes. */
  smooth?: boolean;
  /** Centre décalé dans la case (formes composées). */
  at?: readonly [number, number];
}

/**
 * Solide de révolution à `sides` faces autour de l'axe vertical, avec un dessus plat si le profil
 * se termine par un rayon non nul. Pas de fond : un obstacle repose toujours sur la piste.
 */
function lathe(out: number[], normals: number[], profile: Profile, sides: number, o: LatheOptions = {}): void {
  const [cx, cz] = o.at ?? [0, 0];
  const phase = o.phase ?? 0;
  const ang = (i: number) => phase + (i / sides) * Math.PI * 2;
  const pt = (r: number, y: number, i: number) => [cx + r * Math.sin(ang(i)), y, cz + r * Math.cos(ang(i))];
  const face = (a: number[], b: number[], c: number[]) => {
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      .cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    out.push(...a, ...b, ...c);
    normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
  };
  for (let s = 0; s + 1 < profile.length; s++) {
    const [r0, y0] = profile[s], [r1, y1] = profile[s + 1];
    for (let i = 0; i < sides; i++) {
      const a0 = pt(r0, y0, i), a1 = pt(r0, y0, i + 1), b0 = pt(r1, y1, i), b1 = pt(r1, y1, i + 1);
      const start = normals.length;
      // Un rayon nul (pointe) réduit le pan à un seul triangle.
      if (r0 > 0) face(a0, a1, b1);
      if (r1 > 0) face(a0, b1, b0);
      if (o.smooth) {
        // Normale du profil (y1 - y0, r0 - r1), tournée vers l'angle de chaque sommet.
        const len = Math.hypot(y1 - y0, r0 - r1), nr = (y1 - y0) / len, ny = (r0 - r1) / len;
        for (let k = start; k < normals.length; k += 3) {
          const dx = out[k] - cx, dz = out[k + 2] - cz;
          const phi = Math.hypot(dx, dz) < 1e-6 ? ang(i + 0.5) : Math.atan2(dx, dz); // pointe : milieu du pan
          normals[k] = nr * Math.sin(phi); normals[k + 1] = ny; normals[k + 2] = nr * Math.cos(phi);
        }
      }
    }
  }
  const [rTop, yTop] = profile[profile.length - 1];
  // Dessus en éventail depuis un sommet du bord : n - 2 triangles.
  if (rTop > 0) for (let i = 1; i + 1 < sides; i++) face(pt(rTop, yTop, 0), pt(rTop, yTop, i), pt(rTop, yTop, i + 1));
}

/** Triangle à normale plate, retourné au besoin pour regarder à l'opposé du point intérieur `inside`. */
function tri(out: number[], normals: number[], a: number[], b: number[], c: number[], inside: readonly number[]): void {
  const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    .cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
  if (n.x * (a[0] - inside[0]) + n.y * (a[1] - inside[1]) + n.z * (a[2] - inside[2]) < 0) {
    [b, c] = [c, b];
    n.negate();
  }
  out.push(...a, ...b, ...c);
  normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
}

/**
 * Prisme droit : section `pts` (polygone étoilé autour de son centre de gravité), épaisse de 2 × `half` le long de
 * `axis`. Axe x : la section est face à la caméra (roue, scie) ; axe z : elle court en travers de la piste (tronc couché).
 */
function prism(out: number[], normals: number[], pts: readonly (readonly [u: number, v: number])[], axis: 'x' | 'z', half: number): void {
  const at = (u: number, v: number, w: number) => (axis === 'x' ? [w, v, u] : [u, v, w]);
  const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length, cv = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const inside = at(cu, cv, 0);
  for (let i = 0; i < pts.length; i++) {
    const [u0, v0] = pts[i], [u1, v1] = pts[(i + 1) % pts.length];
    tri(out, normals, at(u0, v0, -half), at(u1, v1, -half), at(u1, v1, half), inside);
    tri(out, normals, at(u0, v0, -half), at(u1, v1, half), at(u0, v0, half), inside);
    for (const w of [-half, half]) tri(out, normals, at(cu, cv, w), at(u0, v0, w), at(u1, v1, w), inside);
  }
}

/** `n` points sur un cercle de centre (0 ; 0,5), rayons alternés (étoile) si `radii` en donne plusieurs. */
const ring = (n: number, radii: readonly number[], phase = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2, r = radii[i % radii.length];
    return [r * Math.sin(a), 0.5 + r * Math.cos(a)] as const;
  });

/** Rayon d'un polygone régulier à `n` côtés dont les côtés sont à 0,5 du centre. */
const flatTo = (n: number) => 0.5 / Math.cos(Math.PI / n);

/** Formes disponibles pour les décors. Ajouter une forme = une entrée ici et dans `OBSTACLE_SHAPES`. */
const SHAPES: Record<ObstacleShape, (pos: number[], nor: number[]) => void> = {
  box: (p, n) => lathe(p, n, [[flatTo(4), 0], [flatTo(4), 1]], 4, { phase: Math.PI / 4 }),
  hex: (p, n) => lathe(p, n, [[0.5, 0], [0.5, 1]], 6, { phase: Math.PI / 6 }),
  octo: (p, n) => lathe(p, n, [[flatTo(8), 0], [flatTo(8), 1]], 8, { phase: Math.PI / 8 }),
  round: (p, n) => lathe(p, n, [[0.5, 0], [0.5, 1]], 10, { smooth: true }),
  pyramid: (p, n) => lathe(p, n, [[0.5, 0], [0, 1]], 4, { phase: Math.PI / 4 }),
  cone: (p, n) => lathe(p, n, [[0.45, 0], [0, 1]], 10, { smooth: true }),
  crystal: (p, n) => lathe(p, n, [[0.3, 0], [0.38, 0.4], [0, 1]], 6),
  cluster: (p, n) => {
    lathe(p, n, [[0.28, 0], [0, 1]], 6, { at: [0.04, -0.02] });
    lathe(p, n, [[0.18, 0], [0, 0.6]], 5, { at: [-0.27, 0.25] });
    lathe(p, n, [[0.16, 0], [0, 0.5]], 5, { at: [0.28, -0.27], phase: 0.6 });
  },
  // Tremplins, une fois étirés à leur faible hauteur : rampe de lancement qui monte vers l'avant, ou galette.
  wedge: (p, n) => prism(p, n, [[-0.5, 0], [0.5, 0], [0.5, 1]], 'z', 0.4),
  disc: (p, n) => lathe(p, n, [[0.5, 0], [0.42, 1]], 12),
  // Tronc couché en travers de la piste : faces plates dessus et dessous, pour rouler exactement sur son dessus.
  log: (p, n) => prism(p, n, ring(8, [flatTo(8)], Math.PI / 8), 'z', 0.5),
  // Mobiles : centrés à mi-hauteur pour rouler sur eux-mêmes sans sortir de leur case.
  ball: (p, n) => lathe(p, n, [[0, 0], [0.5 * Math.SQRT1_2, 0.5 - 0.5 * Math.SQRT1_2], [0.5, 0.5], [0.5 * Math.SQRT1_2, 0.5 + 0.5 * Math.SQRT1_2], [0, 1]], 8),
  wheel: (p, n) => prism(p, n, ring(12, [0.5]), 'x', 0.3),
  saw: (p, n) => prism(p, n, ring(24, [0.5, 0.33]), 'x', 0.15),
};

/** Géométrie d'une forme dans la case unité, non indexée, normales comprises. */
export function shapeGeometry(shape: ObstacleShape): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  SHAPES[shape](pos, nor);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Arêtes entre faces à plus de 40° : celles d'un octogone, pas celles d'un tronc rond à 10 pans. */
const EDGE_ANGLE = 40;
/** Arêtes poussées un peu vers l'extérieur pour ne pas scintiller sur les faces. */
const EDGE_GROW = 1.004;

/** Obstacles d'un niveau. `update` fait rouler les mobiles, tout le reste est immobile. */
export class ObstacleGroup extends THREE.Group {
  private readonly movers: Obstacle[];
  private moverMesh: THREE.InstancedMesh | null = null;
  private readonly m = new THREE.Matrix4();
  private lastPx = NaN;

  constructor(level: Level) {
    super();
    this.name = 'obstacles';
    this.movers = level.obstacles.filter((o) => o.kind === 'mover');
  }

  /** @internal */
  setMovers(mesh: THREE.InstancedMesh): void {
    this.moverMesh = mesh;
    // Sphère englobante de tous les rails : les mobiles bougent, ils ne doivent pas être écartés à tort.
    const box = new THREE.Box3();
    for (const o of this.movers) box.expandByPoint(new THREE.Vector3(o.x, o.y, o.z0)).expandByPoint(new THREE.Vector3(o.x + 1, o.y + o.h, o.z1));
    mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    this.update(0);
  }

  /** Place les mobiles pour un cube en `px` (sa position interpolée), comme la simulation : rien n'est alloué. */
  update(px: number): void {
    const mesh = this.moverMesh;
    if (!mesh || px === this.lastPx) return;
    this.lastPx = px;
    const m = this.m, te = m.elements;
    for (let i = 0; i < this.movers.length; i++) {
      const o = this.movers[i];
      const z = moverZ(o, px);
      // Roule sans glisser (rayon 0,5) autour de son centre, à mi-hauteur de sa case.
      const a = 2 * (z - o.z0);
      m.makeRotationX(a);
      te[12] = o.x + 0.5;
      te[13] = o.y + 0.5 - 0.5 * Math.cos(a);
      te[14] = z + 0.5 - 0.5 * Math.sin(a);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Décalage des contours plats vers l'extérieur, pour ne pas scintiller sur la face qu'ils bordent. */
const OUTLINE_GROW = 0.002;
/** Hauteur des rails des mobiles : au-dessus des lignes de la piste (0,02 et 0,03). */
const RAIL_Y = 0.04;

export function buildObstacles(level: Level, theme: Theme): ObstacleGroup {
  const group = new ObstacleGroup(level);
  const tmp = new THREE.Object3D();
  const edgePos: number[] = [], edgeCol: number[] = [];
  const color = new THREE.Color();
  const line = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    edgePos.push(x0, y0, z0, x1, y1, z1);
    edgeCol.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };

  for (const type of OBSTACLE_TYPES) {
    const list = level.obstacles.filter((o) => o.type === type);
    if (list.length === 0) continue;
    const style = theme.obstacles[type];
    const geo = shapeGeometry(style.shape);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: style.color, emissive: style.emissive ?? 0, emissiveIntensity: style.glow ?? 0, roughness: 0.4,
      }),
      list.length,
    );
    mesh.name = type;
    list.forEach((o, i) => {
      tmp.position.set(o.x + 0.5, o.y, (o.z0 + o.z1) / 2);
      tmp.scale.set(1, o.h, o.z1 - o.z0);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    group.add(mesh);
    if (type === 'mover') group.setMovers(mesh);

    if (style.edges === undefined) continue;
    color.setHex(style.edges);

    if (type === 'mover') {
      // Un mobile bouge : pas d'arêtes, mais son rail tracé sur la piste (deux lignes et deux butées).
      for (const o of list) {
        for (const dx of [0.3, 0.7]) line(o.x + dx, RAIL_Y, o.z0, o.x + dx, RAIL_Y, o.z1);
        for (const z of [o.z0, o.z1]) line(o.x + 0.3, RAIL_Y, z, o.x + 0.7, RAIL_Y, z);
      }
      continue;
    }

    if (type === 'pit') {
      // Fosses voisines fondues en une seule : on ne trace que les côtés qui ne touchent pas une autre fosse.
      const cells = new Set(list.map((o) => `${o.x}:${o.z0}`));
      const g = OUTLINE_GROW;
      for (const o of list) {
        const y = o.y + o.h;
        if (!cells.has(`${o.x - 1}:${o.z0}`)) line(o.x - g, y, o.z0 - g, o.x - g, y, o.z1 + g);
        if (!cells.has(`${o.x + 1}:${o.z0}`)) line(o.x + 1 + g, y, o.z0 - g, o.x + 1 + g, y, o.z1 + g);
        if (!cells.has(`${o.x}:${o.z0 - 1}`)) line(o.x - g, y, o.z0 - g, o.x + 1 + g, y, o.z0 - g);
        if (!cells.has(`${o.x}:${o.z0 + 1}`)) line(o.x - g, y, o.z1 + g, o.x + 1 + g, y, o.z1 + g);
      }
      continue;
    }

    const unit = new THREE.EdgesGeometry(geo, EDGE_ANGLE).getAttribute('position');
    // Le contour du bas est caché par la piste : on ne garde que les arêtes qui montent ou celles du dessus.
    // Le contour du dessus est répété à chaque unité de hauteur pour les décors à strates.
    const seen: number[] = [], top: number[] = [];
    for (let v = 0; v < unit.count; v += 2) {
      const y0 = unit.getY(v), y1 = unit.getY(v + 1);
      if (y0 < 0.001 && y1 < 0.001) continue;
      seen.push(v, v + 1);
      if (y0 > 0.999 && y1 > 0.999) top.push(v, v + 1);
    }
    for (const o of list) {
      const cx = o.x + 0.5, cz = (o.z0 + o.z1) / 2, w = o.z1 - o.z0;
      const push = (v: number, y: number) => {
        edgePos.push(cx + unit.getX(v) * EDGE_GROW, y, cz + unit.getZ(v) * w * EDGE_GROW);
        edgeCol.push(color.r, color.g, color.b);
      };
      for (const v of seen) push(v, o.y + unit.getY(v) * o.h);
      if (style.layers) for (let k = 1; k < o.h; k++) for (const v of top) push(v, o.y + k);
    }
  }

  if (edgePos.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
    const edges = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    edges.name = 'edges';
    group.add(edges);
  }
  return group;
}
