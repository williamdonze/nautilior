import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();

/**
 * IK à deux os (épaule → coude → poignet).
 * Calcule la position du coude pour que le bras atteigne `target`,
 * le coude pliant du côté indiqué par `pole`.
 * Loi des cosinus : cos(A) = (a² + d² − b²) / (2ad)
 */
export function solveTwoBone(root, target, a, b, pole, outElbow) {
  _dir.subVectors(target, root);
  let d = _dir.length();
  if (d < 1e-5) {
    _dir.set(0, 0, 1);
    d = 1e-5;
  } else {
    _dir.divideScalar(d);
  }
  d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3);

  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);

  // Direction de pliage : le pôle projeté perpendiculairement à l'axe du bras
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(0, -1, 0).addScaledVector(_dir, -_dir.y);
  _perp.normalize();

  outElbow.copy(root).addScaledVector(_dir, a * cosA).addScaledVector(_perp, a * sinA);
  return outElbow;
}
