import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Decor, PROP_TILE } from './decor';
import { THEMES } from './themes';

/** Ce que coûte un sous-graphe au GPU : draw calls, triangles (instances comprises), points. */
function cost(root: THREE.Object3D) {
  let calls = 0, tris = 0, points = 0;
  root.traverseVisible((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    const n = g.index ? g.index.count : g.getAttribute('position').count;
    calls++;
    if ((o as THREE.Points).isPoints) points += n;
    else if ((o as THREE.Mesh).isMesh) tris += (n / 3) * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  return { calls, tris, points };
}

/** Empreinte de toutes les positions et matrices d'instance, pour comparer deux constructions. */
function fingerprint(root: THREE.Object3D): number {
  let h = 0;
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const arrays = [g?.getAttribute('position')?.array, (o as THREE.InstancedMesh).instanceMatrix?.array];
    for (const a of arrays) if (a) for (let i = 0; i < a.length; i++) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
  });
  return h;
}

describe('Decor', () => {
  THEMES.forEach((t) => {
    it(`${t.name} : au plus 5 draw calls, 10 000 triangles et 1 200 points`, () => {
      const c = cost(new Decor(t).object);
      expect(c.calls).toBeLessThanOrEqual(5);
      expect(c.tris).toBeLessThanOrEqual(10_000);
      expect(c.points).toBeLessThanOrEqual(1_200);
    });

    it(`${t.name} : identique d'une construction à l'autre (aléa à graine fixe)`, () => {
      expect(fingerprint(new Decor(t).object)).toBe(fingerprint(new Decor(t).object));
    });

    it(`${t.name} : le décor couvre toujours la zone visible devant la caméra`, () => {
      const d = new Decor(t);
      const cam = new THREE.Vector3(0, 4.4, 0);
      for (const x of [-6, 0, 37.5, PROP_TILE - 11, PROP_TILE * 3 + 0.25, 1234.5]) {
        cam.x = x;
        d.update(cam, 0);
        // Les objets du bord couvrent [props.x, props.x + 2 × PROP_TILE[ : de 10 u derrière à 110 u devant.
        expect(d.props.position.x).toBeLessThanOrEqual(x - 10);
        expect(d.props.position.x + 2 * PROP_TILE).toBeGreaterThanOrEqual(x + 110);
        // Recalage par tuile entière : la 2e moitié est la copie de la 1re, le saut est invisible.
        expect(Math.abs(d.props.position.x % PROP_TILE)).toBe(0);
        // Le ciel est à l'infini : il suit la caméra.
        expect(d.sky.position.toArray()).toEqual(cam.toArray());
      }
    });
  });
});
