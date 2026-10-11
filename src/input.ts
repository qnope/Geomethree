import { lateralTilt, steerFromTilt } from './game/tilt';

type Granted = 'granted' | 'denied' | 'unavailable';

interface OrientationCtor { requestPermission?: () => Promise<'granted' | 'denied'> }

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

const screenAngle = (): number =>
  screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0);

/**
 * Entrées du jeu : inclinaison du téléphone pour la direction (clavier ←/→ et boutons à l'écran
 * en secours), toucher n'importe où ailleurs / Espace pour sauter.
 */
export class Controls {
  /** Vrai dès qu'une vraie mesure d'inclinaison est arrivée. */
  tiltActive = false;
  private tilt = 0;
  private left = false;
  private right = false;
  private btnLeft = false;
  private btnRight = false;
  private readonly jumpPointers = new Set<number>();
  private keyJump = false;

  get jumpHeld(): boolean {
    return this.keyJump || this.jumpPointers.size > 0;
  }

  /** Direction finale -1…1 : l'inclinaison est analogique, clavier et boutons sont tout ou rien. */
  get steer(): number {
    return clamp1(this.tilt + (this.right || this.btnRight ? 1 : 0) - (this.left || this.btnLeft ? 1 : 0));
  }

  attach(target: Window = window): void {
    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      this.tilt = steerFromTilt(lateralTilt(e.beta, e.gamma, screenAngle()));
      this.tiltActive = true;
    });
  }

  /** Sur iOS, la permission doit être demandée dans un geste de l'utilisateur (clic, pas pointerdown). */
  async requestTilt(): Promise<Granted> {
    const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    if (!ctor) return 'unavailable';
    if (typeof ctor.requestPermission !== 'function') return 'granted'; // Android et ordinateurs : pas de permission
    try {
      return (await ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  pressJump(id: number): void { this.jumpPointers.add(id); }
  releaseJump(id: number): void { this.jumpPointers.delete(id); }
  setButton(side: 'left' | 'right', down: boolean): void {
    if (side === 'left') this.btnLeft = down;
    else this.btnRight = down;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': case 'KeyQ': this.left = down; break;
      case 'ArrowRight': case 'KeyD': this.right = down; break;
      case 'Space': case 'ArrowUp': case 'KeyW': case 'KeyZ': this.keyJump = down; break;
      default: return;
    }
    e.preventDefault();
  }
}
