import * as THREE from 'three';
import { OBSTACLE_TYPES, type Level } from '../game/level';
import type { ObstacleShape, Theme } from './themes';

/**
 * Rendu des obstacles : le niveau ne donne que des types (mur, rampe…) et leurs cases de collision,
 * le décor choisit la forme, les couleurs et les arêtes de chaque type.
 * Chaque forme est dessinée dans une case unité (x et z dans [-0,5 ; 0,5], y dans [0 ; 1]),
 * puis étirée à la taille de l'obstacle : le rendu ne déborde jamais de la collision.
 * Un maillage instancié par type présent, plus une seule géométrie pour toutes les arêtes.
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

export function buildObstacles(level: Level, theme: Theme): THREE.Group {
  const group = new THREE.Group();
  group.name = 'obstacles';
  const tmp = new THREE.Object3D();
  const edgePos: number[] = [], edgeCol: number[] = [];
  const color = new THREE.Color();

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

    if (style.edges === undefined) continue;
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
    color.setHex(style.edges);
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
