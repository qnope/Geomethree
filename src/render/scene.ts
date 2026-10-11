import * as THREE from 'three';
import type { Game } from '../game/game';
import { rollPose, type RollPose } from '../game/roll';

const PIECES = 12;

/** Scène Three.js : un mesh joueur, 2 InstancedMesh pour tout le niveau, ~5 draw calls. */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  private readonly player: THREE.Mesh;
  private readonly pieces: THREE.InstancedMesh;
  private readonly pieceVel = new Float32Array(PIECES * 3);
  private readonly piecePos = new Float32Array(PIECES * 3);
  private readonly tmp = new THREE.Object3D();
  private readonly bg = new THREE.Color();
  private readonly pose: RollPose = { cx: 0, cy: 0, angle: 0 };
  private deathT = -1;

  constructor(canvas: HTMLCanvasElement, private readonly game: Game) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.fog = new THREE.Fog(0x0b0820, 40, 90);

    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x220033, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 10, 8);
    this.scene.add(sun);

    // Sol : un seul plan + grille.
    const len = game.level.length + 80;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 40),
      new THREE.MeshStandardMaterial({ color: 0x120c30, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(len / 2 - 20, 0, 0);
    this.scene.add(ground);
    // Grille construite à la main (1 draw call) : traverses tous les 2 u, rails tous les 2 u en z.
    const x0 = -20, x1 = len - 20, pts: number[] = [];
    for (let gx = x0; gx <= x1; gx += 2) pts.push(gx, 0, -20, gx, 0, 20);
    for (let gz = -20; gz <= 20; gz += 2) pts.push(x0, 0, gz, x1, 0, gz);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x4a2fd0 }));
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Piste lumineuse sous la trajectoire du cube, pour lire la profondeur.
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x2b1a7a }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(len / 2 - 20, 0.01, 0); // assez haut pour éviter le z-fighting en vue rasante
    this.scene.add(track);

    // Joueur.
    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    this.player = new THREE.Mesh(
      pGeo,
      new THREE.MeshStandardMaterial({ color: 0x33ddff, emissive: 0x0a6a88, roughness: 0.35 }),
    );
    this.player.add(new THREE.LineSegments(new THREE.EdgesGeometry(pGeo), new THREE.LineBasicMaterial({ color: 0xffffff })));
    this.scene.add(this.player);

    // Obstacles instanciés.
    const obs = game.level.obstacles;
    const blocks = obs.filter((o) => o.kind === 'block');
    const spikes = obs.filter((o) => o.kind === 'spike');
    const blockMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6a4cff, emissive: 0x4a2fd0, emissiveIntensity: 0.6, roughness: 0.4 }),
      blocks.length,
    );
    blocks.forEach((b, i) => {
      this.tmp.position.set(b.x + 0.5, b.y + 0.5, 0);
      this.tmp.updateMatrix();
      blockMesh.setMatrixAt(i, this.tmp.matrix);
    });
    const spikeGeo = new THREE.ConeGeometry(0.5, 1, 4);
    spikeGeo.rotateY(Math.PI / 4);
    const spikeMesh = new THREE.InstancedMesh(
      spikeGeo,
      new THREE.MeshStandardMaterial({ color: 0xff3d7f, emissive: 0xff1a5e, emissiveIntensity: 0.8, roughness: 0.4 }),
      spikes.length,
    );
    spikes.forEach((s, i) => {
      this.tmp.position.set(s.x + 0.5, s.y + 0.5, 0);
      this.tmp.updateMatrix();
      spikeMesh.setMatrixAt(i, this.tmp.matrix);
    });
    // Contours blancs de tous les blocs fusionnés en une seule géométrie : 1 draw call.
    const edge = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)).getAttribute('position');
    const edgePts = new Float32Array(edge.count * 3 * blocks.length);
    blocks.forEach((b, i) => {
      for (let v = 0; v < edge.count; v++) {
        const k = (i * edge.count + v) * 3;
        edgePts[k] = edge.getX(v) + b.x + 0.5;
        edgePts[k + 1] = edge.getY(v) + b.y + 0.5;
        edgePts[k + 2] = edge.getZ(v);
      }
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePts, 3));
    const blockEdges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xd8ccff }));
    this.scene.add(blockMesh, spikeMesh, blockEdges);

    // Ligne d'arrivée.
    const finish = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    finish.rotation.y = -Math.PI / 2; // face à la caméra
    finish.position.set(game.level.length, 4, 0);
    this.scene.add(finish);

    // Débris d'explosion (pré-alloués).
    this.pieces = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 0x33ddff }),
      PIECES,
    );
    this.pieces.visible = false;
    this.scene.add(this.pieces);

    this.resize();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En portrait, on recule la caméra pour voir assez loin devant.
    this.camera.fov = w < h ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  explode(): void {
    this.deathT = 0;
    this.pieces.visible = true;
    this.player.visible = false;
    const p = this.game.player;
    for (let i = 0; i < PIECES; i++) {
      this.piecePos[i * 3] = p.x + 0.5;
      this.piecePos[i * 3 + 1] = p.y + 0.5;
      this.piecePos[i * 3 + 2] = 0;
      this.pieceVel[i * 3] = (Math.random() - 0.7) * 8;
      this.pieceVel[i * 3 + 1] = Math.random() * 10 + 2;
      this.pieceVel[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
  }

  reset(): void {
    this.deathT = -1;
    this.pieces.visible = false;
    this.player.visible = true;
  }

  render(dt: number, time: number): void {
    const g = this.game, p = g.player;
    const a = g.status === 'running' ? g.alpha : 1;
    const x = p.prevX + (p.x - p.prevX) * a;
    const y = p.prevY + (p.y - p.prevY) * a;

    // Roulade physique : l'angle suit la distance (1 tour = 4 cases), au sol comme en l'air.
    // Au sol, le cube pivote sur son arête avant ; en l'air, il tourne autour de son centre.
    const pose = rollPose(x, this.pose);
    if (p.grounded) this.player.position.set(pose.cx, y + pose.cy, 0);
    else this.player.position.set(x + 0.5, y + 0.5, 0);
    this.player.rotation.z = pose.angle;

    if (this.deathT >= 0) {
      this.deathT += dt;
      for (let i = 0; i < PIECES; i++) {
        const k = i * 3;
        this.pieceVel[k + 1] -= 30 * dt;
        this.piecePos[k] += this.pieceVel[k] * dt;
        this.piecePos[k + 1] = Math.max(0.12, this.piecePos[k + 1] + this.pieceVel[k + 1] * dt);
        this.piecePos[k + 2] += this.pieceVel[k + 2] * dt;
        this.tmp.position.set(this.piecePos[k], this.piecePos[k + 1], this.piecePos[k + 2]);
        this.tmp.rotation.set(this.deathT * 9 + i, this.deathT * 7, 0);
        this.tmp.updateMatrix();
        this.pieces.setMatrixAt(i, this.tmp.matrix);
      }
      this.pieces.instanceMatrix.needsUpdate = true;
    }

    // Caméra derrière le cube, légèrement au-dessus : on fonce vers les obstacles.
    const cam = this.camera;
    cam.position.x = x - 5;
    cam.position.y += (y + 3.8 - cam.position.y) * Math.min(1, dt * 5);
    cam.position.z = 0;
    cam.lookAt(x + 12, cam.position.y - 3.2, 0);

    // Fond qui pulse lentement.
    this.bg.setHSL(0.7 + Math.sin(time * 0.15) * 0.06, 0.7, 0.015);
    this.renderer.setClearColor(this.bg);
    (this.scene.fog as THREE.Fog).color.copy(this.bg);

    this.renderer.render(this.scene, cam);
  }
}
