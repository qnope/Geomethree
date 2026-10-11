import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildObstacles, shapeGeometry } from './obstacles';
import { OBSTACLE_SHAPES, THEMES } from './themes';
import { LEVELS } from '../game/levels';
import { OBSTACLE_TYPES, type Obstacle } from '../game/level';

// Escalade contient les 4 types : murs, rampe, escalier, pyramides.
const level = LEVELS[3].level;
const ofType = (type: string) => level.obstacles.filter((o) => o.type === type);

/** Boîte occupée à l'écran par l'instance `i` d'un maillage instancié. */
function instanceBox(mesh: THREE.InstancedMesh, i: number): THREE.Box3 {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(m);
}

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
  it('le niveau témoin contient les 4 types', () => {
    for (const type of OBSTACLE_TYPES) expect(ofType(type).length).toBeGreaterThan(0);
  });

  THEMES.forEach((t) => {
    const group = buildObstacles(level, t);
    const meshes = group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);

    it(`${t.name} : chaque obstacle est dessiné une fois, un maillage instancié par type`, () => {
      expect(meshes.map((m) => m.name).sort()).toEqual([...OBSTACLE_TYPES].sort());
      for (const m of meshes) expect(m.count).toBe(ofType(m.name).length);
    });

    it(`${t.name} : au plus un draw call par type, plus un pour toutes les arêtes`, () => {
      expect(group.children.length).toBeLessThanOrEqual(OBSTACLE_TYPES.length + 1);
      expect(group.children.filter((c) => (c as THREE.LineSegments).isLineSegments).length).toBeLessThanOrEqual(1);
    });

    it(`${t.name} : le rendu de chaque obstacle tient dans sa boîte de collision`, () => {
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
