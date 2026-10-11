export interface Box { x: number; y: number; z: number; w: number; h: number; d: number }

/** Chevauchement strict en 3D : un contact de bord ne compte pas. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y &&
    a.z < b.z + b.d && a.z + a.d > b.z
  );
}
