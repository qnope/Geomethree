/** Fenêtre glissante de temps de frame (ms), sans allocation après construction. */
export class FrameStats {
  private readonly buf: Float64Array;
  private n = 0;
  private i = 0;
  private sum = 0;

  constructor(readonly size = 120) {
    this.buf = new Float64Array(size);
  }

  push(ms: number): void {
    if (this.n === this.size) this.sum -= this.buf[this.i];
    else this.n++;
    this.buf[this.i] = ms;
    this.sum += ms;
    this.i = (this.i + 1) % this.size;
  }

  get avgMs(): number {
    return this.n ? this.sum / this.n : 0;
  }

  get fps(): number {
    return this.avgMs ? 1000 / this.avgMs : 0;
  }

  get worstMs(): number {
    let w = 0;
    for (let k = 0; k < this.n; k++) if (this.buf[k] > w) w = this.buf[k];
    return w;
  }
}
