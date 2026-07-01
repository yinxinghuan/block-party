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

function yarnBall(): ZombieGroup {
  const g = applianceGroup();
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xff8fc6, roughness: 0.95, emissive: 0xff4f9d, emissiveIntensity: 0.12 }),
  ));
  for (let i = 0; i < 5; i++) {
    const strand = box(0.05, 0.05, 0.92, i % 2 ? 0xffd7eb : 0xf7eee8, 0, 0.42, 0);
    strand.rotation.y = i * 0.72;
    strand.rotation.z = (i - 2) * 0.18;
    g.add(strand);
  }
  finish(g);
  g.scale.setScalar(0.72);
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

function toyTrain(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.88, 0.32, 0.46, 0x6cc6ff, 0, 0.26, 0, { e: BLUE, ei: 0.2 }));
  g.add(box(0.36, 0.44, 0.40, 0xffd060, -0.18, 0.58, -0.02, { e: P.gold, ei: 0.25 }));
  g.add(cyl(0.16, 0.16, 0.18, 12, BLACK, 0.36, 0.48, 0.00));
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.22, 0.22]) g.add(wheel(x, z));
  }
  finish(g);
  g.scale.setScalar(0.72);
  return g;
}

function toyCar(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.64, 0.22, 0.86, PINK, 0, 0.24, 0, { e: PINK, ei: 0.3 }));
  g.add(box(0.44, 0.18, 0.32, GLASS, 0, 0.42, -0.10, { e: BLUE, ei: 0.35 }));
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.30, 0.30]) g.add(wheel(x, z));
  }
  g.add(box(0.20, 0.08, 0.10, P.gold, 0, 0.42, 0.42, { e: P.gold, ei: 0.7 }));
  finish(g);
  g.scale.setScalar(0.74);
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

function laundryBasket(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(1.02, 0.70, 0.92, 0xe8dcc8, 0, 0.46, 0));
  g.add(box(1.14, 0.12, 1.04, BODY_D, 0, 0.86, 0));
  for (const x of [-0.32, 0, 0.32]) {
    g.add(box(0.08, 0.50, 0.04, GLASS, x, 0.48, 0.48, { e: BLUE, ei: 0.15 }));
  }
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2f8, roughness: 0.9 }),
  ));
  g.children[g.children.length - 1].position.set(-0.24, 0.96, 0.06);
  finish(g);
  g.scale.setScalar(0.84);
  return g;
}

function ottoman(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(1.10, 0.56, 0.96, 0xb98362, 0, 0.34, 0));
  g.add(box(1.20, 0.20, 1.06, 0x6e493e, 0, 0.76, 0));
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.34, 0.34]) g.add(box(0.12, 0.20, 0.12, BLACK, x, 0.10, z));
  }
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

function laserPointer(): ZombieGroup {
  const g = applianceGroup();
  g.add(cyl(0.18, 0.22, 0.70, 14, BODY_D, 0, 0.48, 0));
  g.children[0].rotation.x = Math.PI / 2;
  g.add(box(0.18, 0.20, 0.16, BLACK, 0, 0.48, 0.42));
  g.add(box(0.08, 0.08, 0.10, 0xff2040, 0, 0.48, 0.78, { e: 0xff2040, ei: 1.4 }));
  g.add(cyl(0.28, 0.36, 0.12, 14, BODY, 0, 0.12, -0.10));
  finish(g);
  g.scale.setScalar(0.74);
  return g;
}

function floorFan(): ZombieGroup {
  const g = applianceGroup();
  g.add(cyl(0.36, 0.42, 0.10, 20, BODY_D, 0, 0.08, 0));
  g.add(box(0.12, 0.82, 0.12, BODY_D, 0, 0.50, 0));
  const cage = cyl(0.56, 0.56, 0.16, 24, GLASS, 0, 1.02, 0);
  cage.rotation.x = Math.PI / 2;
  g.add(cage);
  for (let i = 0; i < 4; i++) {
    const blade = box(0.12, 0.04, 0.42, BLUE, 0, 1.02, 0.18, { e: BLUE, ei: 0.35 });
    blade.rotation.y = (Math.PI / 2) * i;
    g.add(blade);
  }
  finish(g);
  g.scale.setScalar(0.78);
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

function hairDryer(): ZombieGroup {
  const g = applianceGroup();
  const body = cyl(0.28, 0.34, 0.72, 16, BODY, 0, 0.62, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nozzle = cyl(0.16, 0.24, 0.48, 14, BODY_D, 0, 0.62, 0.52);
  nozzle.rotation.x = Math.PI / 2;
  g.add(nozzle);
  g.add(box(0.14, 0.56, 0.14, BLACK, 0, 0.30, -0.10));
  g.add(box(0.22, 0.08, 0.18, PINK, 0, 0.70, -0.34, { e: PINK, ei: 0.75 }));
  finish(g);
  g.scale.setScalar(0.78);
  return g;
}

function sprayBottle(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.38, 0.70, 0.30, GLASS, 0, 0.44, 0, { e: BLUE, ei: 0.22 }));
  g.add(box(0.30, 0.18, 0.26, PINK, 0, 0.88, 0, { e: PINK, ei: 0.35 }));
  g.add(box(0.58, 0.10, 0.14, BODY_D, 0.18, 0.96, 0.10));
  g.add(box(0.12, 0.26, 0.12, BLACK, -0.10, 0.76, 0));
  finish(g);
  g.scale.setScalar(0.78);
  return g;
}

function featherDuster(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.12, 0.18, 0.82, BODY_D, 0, 0.44, -0.16));
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.08;
    const feather = box(0.08, 0.38, 0.16, i % 2 ? 0xffd6ec : 0xf8f0d8, x, 0.78 + Math.abs(i - 3) * 0.02, 0.26);
    feather.rotation.z = (i - 3) * 0.16;
    g.add(feather);
  }
  finish(g);
  g.scale.setScalar(0.76);
  return g;
}

function paperBag(): ZombieGroup {
  const g = applianceGroup();
  g.add(box(0.58, 0.74, 0.46, 0xc99a5a, 0, 0.46, 0));
  g.add(box(0.42, 0.08, 0.34, 0x7b5637, 0, 0.88, 0));
  g.add(box(0.24, 0.10, 0.06, BLACK, -0.12, 0.54, 0.25));
  g.add(box(0.24, 0.10, 0.06, BLACK, 0.12, 0.54, 0.25));
  finish(g);
  g.scale.setScalar(0.76);
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

function pick<T>(items: Array<() => T>): T {
  return items[Math.floor(Math.random() * items.length)]();
}

export function makeVacuumEnemy(role: ZombieTier, set: 'vacuum' | 'household' = 'vacuum'): ZombieGroup {
  if (set === 'vacuum') {
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
  switch (role) {
    case 'runner': return pick([toyCar, toyTrain]);
    case 'brute': return pick([laundryBasket, ottoman]);
    case 'stalker': return pick([floorFan, laserPointer]);
    case 'exploder': return pick([hairDryer, sprayBottle]);
    case 'ghost': return pick([featherDuster, paperBag]);
    case 'boss': return dockBoss();
    case 'lurker': return pick([() => roomba(0.72), yarnBall]);
    default: return roomba(0.72);
  }
}
