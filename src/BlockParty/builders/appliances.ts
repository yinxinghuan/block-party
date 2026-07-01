// Low-poly appliance builders for semantic cartridges. These are visual-only:
// the game loop still owns HP, speed, collision, and boss behaviour.

import * as THREE from 'three';
import { box, cyl, darken, finish, P } from './prims';
import type { ZombieGroup, ZombieTier } from './monsters';

const BODY = 0xd9dce2;
const BODY_D = 0x7a808a;
const BLACK = 0x15171d;
const GLASS = 0xbfe6ff;
const BLUE = 0x65c8ff;
const PINK = 0xff6fa8;
const GREEN = 0x8eff9a;

function applianceGroup(): ZombieGroup {
  const g = new THREE.Group() as ZombieGroup;
  g.userData = {};
  return g;
}

function wheel(x: number, z: number): THREE.Mesh {
  const m = cyl(0.12, 0.12, 0.12, 12, BLACK, x, 0.14, z);
  m.rotation.z = Math.PI / 2;
  return m;
}

function roomba(scale = 1): ZombieGroup {
  const g = applianceGroup();
  g.add(cyl(0.58, 0.62, 0.26, 24, BODY, 0, 0.18, 0));
  g.add(cyl(0.36, 0.38, 0.05, 24, darken(BODY, 0.82), 0, 0.34, 0));
  g.add(box(0.28, 0.04, 0.16, GLASS, 0, 0.39, 0.18, { e: BLUE, ei: 0.7 }));
  g.add(box(0.10, 0.06, 0.10, PINK, -0.18, 0.39, -0.14, { e: PINK, ei: 0.6 }));
  g.add(box(0.10, 0.06, 0.10, GREEN, 0.18, 0.39, -0.14, { e: GREEN, ei: 0.6 }));
  g.add(wheel(-0.42, 0));
  g.add(wheel(0.42, 0));
  finish(g);
  g.scale.setScalar(scale);
  return g;
}

function stickVac(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.34, 0.22, 0.78, BLACK, 0, 0.22, 0.08));
  g.add(box(0.16, 0.90, 0.16, BODY_D, 0, 0.78, -0.14));
  g.add(box(0.44, 0.34, 0.28, BODY, 0, 1.26, -0.18));
  g.add(box(0.28, 0.08, 0.16, GLASS, 0, 1.30, 0.00, { e: BLUE, ei: 0.6 }));
  g.add(box(0.72, 0.10, 0.18, BLACK, 0, 1.82, -0.14));
  finish(g);
  g.scale.setScalar(0.76);
  return g;
}

function canisterVac(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.92, 0.46, 1.10, BODY, 0, 0.32, 0));
  g.add(box(0.76, 0.20, 0.82, darken(BODY, 0.88), 0, 0.62, -0.06));
  g.add(cyl(0.12, 0.12, 0.68, 12, BLACK, -0.56, 0.20, 0.36));
  g.add(cyl(0.12, 0.12, 0.68, 12, BLACK, 0.56, 0.20, 0.36));
  g.add(box(0.16, 0.16, 0.76, BODY_D, 0, 0.56, 0.78));
  g.add(box(0.44, 0.12, 0.12, P.gold, 0, 0.72, 0.04, { e: P.gold, ei: 0.5 }));
  finish(g);
  g.scale.setScalar(0.82);
  return g;
}

function carpetCleaner(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.90, 0.26, 0.46, BODY_D, 0, 0.20, 0.36));
  g.add(box(0.52, 0.78, 0.42, BODY, 0, 0.72, -0.02));
  g.add(box(0.38, 0.22, 0.34, GLASS, 0, 0.98, 0.20, { e: BLUE, ei: 0.45 }));
  g.add(box(0.16, 0.96, 0.16, BLACK, 0, 1.16, -0.42));
  g.add(box(0.76, 0.10, 0.16, BLACK, 0, 1.68, -0.42));
  finish(g);
  g.scale.setScalar(0.80);
  return g;
}

function dustBuster(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.42, 0.30, 0.86, BODY, 0, 0.42, 0));
  g.add(box(0.34, 0.16, 0.36, BLACK, 0, 0.62, 0.42));
  g.add(box(0.20, 0.34, 0.18, BODY_D, 0, 0.20, -0.30));
  g.add(box(0.16, 0.08, 0.22, PINK, 0, 0.60, -0.02, { e: PINK, ei: 0.8 }));
  finish(g);
  g.scale.setScalar(0.74);
  return g;
}

function dockBoss(): ZombieGroup {
  const g = applianceGroup();
  g.add(cyl(1.05, 1.10, 0.42, 28, BODY, 0, 0.28, 0.18));
  g.add(cyl(0.72, 0.78, 0.12, 28, darken(BODY, 0.82), 0, 0.56, 0.18));
  g.add(box(1.35, 1.45, 0.52, BLACK, 0, 0.86, -0.88));
  g.add(box(1.08, 0.28, 0.08, GLASS, 0, 1.30, -0.58, { e: BLUE, ei: 1.0 }));
  g.add(box(0.16, 0.16, 0.12, PINK, -0.36, 0.64, 0.90, { e: PINK, ei: 1.1 }));
  g.add(box(0.16, 0.16, 0.12, GREEN, 0.36, 0.64, 0.90, { e: GREEN, ei: 1.1 }));
  g.add(box(1.65, 0.08, 0.14, P.gold, 0, 1.62, -0.62, { e: P.gold, ei: 0.7 }));
  finish(g);
  g.scale.setScalar(1.05);
  return g;
}

export function makeVacuumEnemy(role: ZombieTier): ZombieGroup {
  switch (role) {
    case 'runner': return stickVac();
    case 'brute': return canisterVac();
    case 'stalker': return carpetCleaner();
    case 'exploder': return dustBuster();
    case 'ghost': return roomba(0.72);
    case 'boss': return dockBoss();
    case 'lurker':
    default: return roomba(0.72);
  }
}
