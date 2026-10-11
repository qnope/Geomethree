import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildObstacles, shapeGeometry } from './obstacles';
import { OBSTACLE_SHAPES, THEMES } from './themes';
import { OBSTACLE_TYPES, parseMap, type Obstacle } from '../game/level';
import { moverZ } from '../game/game';

// Niveau témoin : les 8 types, dont deux fosses (2 × 2 et 1 × 3) et un mobile sur un rail de 3 couloirs.
const level = parseMap([
  'M...^...__..~...',
  'M...=...__..o...',
  '....=.T.....~.*.',
  '1.2.3.T.........',
  'M.......___.....',
]);
const ofType = (type: string) => level.obstacles.filter((o) => o.type === type);

/** Boîte occupée à l'écran par l'instance `i` d'un maillage instancié (chaque sommet transformé). */
function instanceBox(mesh: THREE.InstancedMesh, i: number): THREE.Box3 {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  const pos = mesh.geometry.getAttribute('position'), v = new THREE.Vector3(), box = new THREE.Box3();
  for (let k = 0; k < pos.count; k++) box.expandByPoint(v.fromBufferAttribute(pos, k).applyMatrix4(m));
  return box;
}

/** Sommets des arêtes à la hauteur `y` (les fosses et les rails ont chacun la leur). */
const edgesAt = (group: THREE.Group, y: number) => {
  const edges = group.children.find((c): c is THREE.LineSegments => (c as THREE.LineSegments).isLineSegments)!;
  const pos = edges.geometry.getAttribute('position');
  return Array.from({ length: pos.count }, (_, k) => k).filter((k) => Math.abs(pos.getY(k) - y) < 1e-6);
};

const EPS = 1e-3;

describe('formes des obstacles', () => {
  for (const shape of OBSTACLE_SHAPES) {
    it(`${shape} : faces non dégénérées, tournées vers l'extérieur, dans la case unité`, () => {
      const g = shapeGeometry(shape);
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const face = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
      let volume = 0;
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
        face.subVectors(b, a).cross(ac.subVectors(c, a));
        expect(face.length()).toBeGreaterThan(1e-6);
        // Volume signé (origine sur le sol, là où il n'y a pas de fond) : positif si les faces regardent dehors.
        volume += a.dot(ac.crossVectors(b, c)) / 6;
        for (let k = 0; k < 3; k++) {
          n.fromBufferAttribute(nor, i + k);
          expect(n.length()).toBeCloseTo(1, 3);
          expect(n.dot(face)).toBeGreaterThan(0);
        }
      }
      expect(volume).toBeGreaterThan(0);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.x).toBeLessThanOrEqual(0.5 + EPS);
      expect(box.min.z).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.z).toBeLessThanOrEqual(0.5 + EPS);
      expect(box.min.y).toBeCloseTo(0, 6);
      expect(box.max.y).toBeCloseTo(1, 6);
    });
  }
});

describe('buildObstacles', () => {
  it('le niveau témoin contient les 8 types', () => {
    for (const type of OBSTACLE_TYPES) expect(ofType(type).length).toBeGreaterThan(0);
  });

  THEMES.forEach((t) => {
    const group = buildObstacles(level, t);
    const meshes = group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
    const mover = meshes.find((m) => m.name === 'mover')!;

    it(`${t.name} : chaque obstacle est dessiné une fois, un maillage instancié par type`, () => {
      expect(meshes.map((m) => m.name).sort()).toEqual([...OBSTACLE_TYPES].sort());
      for (const m of meshes) expect(m.count).toBe(ofType(m.name).length);
    });

    it(`${t.name} : au plus un draw call par type, plus un pour toutes les arêtes`, () => {
      expect(group.children.length).toBeLessThanOrEqual(OBSTACLE_TYPES.length + 1);
      expect(group.children.filter((c) => (c as THREE.LineSegments).isLineSegments).length).toBeLessThanOrEqual(1);
    });

    // Les mobiles bougent : on vérifie à plusieurs instants, avant, pendant et après le passage du cube.
    for (const px of [0, 9.3, 12, 12.4, 40]) {
      it(`${t.name} : le rendu de chaque obstacle tient dans sa boîte de collision (cube en x = ${px})`, () => {
        group.update(px);
        for (const m of meshes) {
          ofType(m.name).forEach((o: Obstacle, i) => {
            const b = instanceBox(m, i);
            expect(b.min.x).toBeGreaterThanOrEqual(o.x - EPS);
            expect(b.max.x).toBeLessThanOrEqual(o.x + 1 + EPS);
            expect(b.min.z).toBeGreaterThanOrEqual(o.z0 - EPS);
            expect(b.max.z).toBeLessThanOrEqual(o.z1 + EPS);
            expect(b.min.y).toBeGreaterThanOrEqual(o.y - EPS);
            expect(b.max.y).toBeLessThanOrEqual(o.y + o.h + EPS);
            if (o.kind === 'block') {
              // Un bloc se voit aussi gros qu'il est solide : on roule exactement sur son dessus.
              expect(b.max.y).toBeCloseTo(o.y + o.h, 3);
              expect(b.max.x - b.min.x).toBeGreaterThanOrEqual(0.85);
              expect(b.max.z - b.min.z).toBeGreaterThanOrEqual(0.85 * (o.z1 - o.z0));
            }
          });
        }
      });
    }

    it(`${t.name} : chaque mobile suit sa case sur le rail et roule`, () => {
      const o = ofType('mover')[0];
      const m = new THREE.Matrix4(), center = new THREE.Vector3(), up = new THREE.Vector3();
      const angles: number[] = [];
      for (const px of [0, 9.3, 12, 12.4, 40]) {
        group.update(px);
        mover.getMatrixAt(0, m);
        center.set(0, 0.5, 0).applyMatrix4(m); // centre de la forme
        expect(center.x).toBeCloseTo(o.x + 0.5, 6);
        expect(center.y).toBeCloseTo(o.y + 0.5, 6);
        expect(center.z).toBeCloseTo(moverZ(o, px) + 0.5, 6);
        up.set(0, 1, 0).transformDirection(m);
        angles.push(Math.atan2(up.z, up.y));
      }
      expect(new Set(angles.map((a) => a.toFixed(3))).size).toBeGreaterThan(1);
    });

    it(`${t.name} : les fosses voisines se fondent, seul leur contour est tracé`, () => {
      // 2 × 2 cases : 8 côtés ; 1 × 3 cases : 8 côtés. Deux sommets par côté.
      expect(edgesAt(group, 0.05)).toHaveLength(16 * 2);
    });

    it(`${t.name} : le rail du mobile est tracé sur la piste (deux lignes et deux butées)`, () => {
      expect(edgesAt(group, 0.04)).toHaveLength(4 * 2);
    });
  });

  it('les obstacles immobiles ne bougent pas avec le cube', () => {
    const g = buildObstacles(level, THEMES[0]);
    const still = g.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh && c.name !== 'mover');
    const snap = () => still.map((m) => Array.from(m.instanceMatrix.array).join());
    const before = snap();
    g.update(13);
    expect(snap()).toEqual(before);
  });

  it('un même niveau garde les mêmes emplacements quel que soit le décor', () => {
    const where = (g: THREE.Group) => g.children
      .filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => Array.from({ length: m.count }, (_, i) => {
        const mat = new THREE.Matrix4();
        m.getMatrixAt(i, mat);
        return mat.toArray().map((v) => v.toFixed(3)); // position et échelle de l'instance
      }));
    const ref = JSON.stringify(where(buildObstacles(level, THEMES[0])));
    for (const t of THEMES.slice(1)) expect(JSON.stringify(where(buildObstacles(level, t)))).toBe(ref);
  });
});
