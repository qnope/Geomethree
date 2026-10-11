import { describe, it, expect } from 'vitest';
import { FrameStats } from './perf';

describe('FrameStats', () => {
  it('calcule FPS et temps de frame moyen', () => {
    const s = new FrameStats(60);
    for (let i = 0; i < 60; i++) s.push(1000 / 60);
    expect(s.fps).toBeCloseTo(60, 0);
    expect(s.avgMs).toBeCloseTo(16.67, 1);
  });
  it('remonte la pire frame de la fenêtre', () => {
    const s = new FrameStats(10);
    for (let i = 0; i < 9; i++) s.push(16);
    s.push(40);
    expect(s.worstMs).toBe(40);
  });
  it('fenêtre glissante : oublie les vieilles frames', () => {
    const s = new FrameStats(4);
    s.push(100);
    for (let i = 0; i < 4; i++) s.push(10);
    expect(s.worstMs).toBe(10);
    expect(s.avgMs).toBe(10);
  });
});
