// Low-poly forest enemies. These keep generated forest cartridges fully 3D
// while the engine continues to own movement, collision, HP, and boss skills.

import * as THREE from 'three';
import { ball, box, cone, cyl, darken, finish, P } from './prims';
import type { ZombieGroup, ZombieTier } from './monsters';

const BARK = 0x765033;
const BARK_D = 0x49311f;
const LEAF = 0x5f9148;
const LEAF_D = 0x355b31;
const MOSS = 0x88a85f;
const CAP = 0xd96455;
const GLOW = P.accent;

function forestGroup(): ZombieGroup {
  const g = new THREE.Group() as ZombieGroup;
  g.userData = {};
  return g;
}

function addEyes(g: THREE.Group, y: number, z: number, spread = 0.14): void {
  for (const x of [-spread, spread]) {
    g.add(ball(0.055, GLOW, x, y, z, { e: GLOW, ei: 1.2 }));
  }
}

function mushroomScout(): ZombieGroup {
  const g = forestGroup();
  g.add(cyl(0.18, 0.25, 0.58, 8, P.cream, 0, 0.34, 0));
  g.add(cone(0.48, 0.34, 8, CAP, 0, 0.78, 0));
  g.add(ball(0.07, P.cream, -0.20, 0.80, 0.25));
  g.add(ball(0.055, P.cream, 0.18, 0.88, 0.20));
  addEyes(g, 0.46, 0.22, 0.09);
  finish(g);
  g.scale.setScalar(0.78);
  return g;
}

function foxRunner(): ZombieGroup {
  const g = forestGroup();
  g.add(box(0.42, 0.40, 0.86, P.orange, 0, 0.48, 0));
  g.add(box(0.38, 0.38, 0.38, P.orange, 0, 0.70, 0.48));
  g.add(cone(0.15, 0.34, 5, darken(P.orange, 0.78), -0.14, 1.00, 0.48));
  g.add(cone(0.15, 0.34, 5, darken(P.orange, 0.78), 0.14, 1.00, 0.48));
  for (const x of [-0.15, 0.15]) {
    for (const z of [-0.25, 0.25]) g.add(box(0.12, 0.48, 0.12, BARK_D, x, 0.22, z));
  }
  const tail = cone(0.22, 0.88, 7, P.orange, 0, 0.58, -0.68);
  tail.rotation.x = -0.92;
  g.add(tail);
  addEyes(g, 0.76, 0.69, 0.10);
  finish(g);
  g.scale.setScalar(0.78);
  return g;
}

function stumpBrute(): ZombieGroup {
  const g = forestGroup();
  g.add(cyl(0.48, 0.62, 1.10, 9, BARK, 0, 0.64, 0));
  g.add(cyl(0.50, 0.50, 0.12, 9, darken(BARK, 1.25), 0, 1.24, 0));
  for (const side of [-1, 1]) {
    const arm = box(0.72, 0.20, 0.22, BARK_D, side * 0.56, 0.80, 0);
    arm.rotation.z = side * -0.34;
    g.add(arm);
    g.add(cone(0.20, 0.42, 6, BARK_D, side * 0.98, 0.66, 0));
  }
  for (const x of [-0.30, 0.30]) {
    const root = cone(0.20, 0.62, 6, BARK_D, x, 0.16, 0.10);
    root.rotation.x = Math.PI;
    g.add(root);
  }
  g.add(ball(0.22, MOSS, -0.30, 1.30, 0.02));
  addEyes(g, 0.88, 0.55, 0.17);
  finish(g);
  g.scale.setScalar(0.88);
  return g;
}

function thornCaster(): ZombieGroup {
  const g = forestGroup();
  g.add(cyl(0.16, 0.24, 0.96, 7, LEAF_D, 0, 0.54, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const thorn = cone(0.16, 0.56, 5, LEAF, Math.cos(a) * 0.30, 0.72, Math.sin(a) * 0.30);
    thorn.rotation.z = Math.PI / 2;
    thorn.rotation.y = -a;
    g.add(thorn);
  }
  g.add(ball(0.28, MOSS, 0, 1.04, 0));
  addEyes(g, 1.05, 0.27, 0.10);
  finish(g);
  g.scale.setScalar(0.82);
  return g;
}

function puffball(): ZombieGroup {
  const g = forestGroup();
  g.add(ball(0.48, P.cream, 0, 0.54, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(cone(0.09, 0.30, 5, CAP, Math.cos(a) * 0.43, 0.56, Math.sin(a) * 0.43));
  }
  g.add(cyl(0.17, 0.22, 0.30, 7, P.panelD, 0, 0.18, 0));
  addEyes(g, 0.58, 0.48, 0.13);
  finish(g);
  g.scale.setScalar(0.80);
  return g;
}

function leafWisp(): ZombieGroup {
  const g = forestGroup();
  g.add(ball(0.24, GLOW, 0, 0.76, 0, { e: GLOW, ei: 0.55, o: 0.82 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = cone(0.16, 0.46, 5, i % 2 ? LEAF : MOSS, Math.cos(a) * 0.42, 0.76 + (i % 3) * 0.10, Math.sin(a) * 0.42);
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = -a;
    g.add(leaf);
  }
  addEyes(g, 0.80, 0.23, 0.08);
  finish(g);
  g.scale.setScalar(0.86);
  return g;
}

function ancientTreeBoss(): ZombieGroup {
  const g = forestGroup();
  g.add(cyl(0.70, 0.96, 1.85, 10, BARK, 0, 1.02, 0));
  for (const side of [-1, 1]) {
    const arm = box(1.10, 0.30, 0.34, BARK_D, side * 0.86, 1.28, 0);
    arm.rotation.z = side * -0.38;
    g.add(arm);
    g.add(ball(0.54, LEAF, side * 1.38, 1.66, 0));
  }
  for (const x of [-0.58, 0, 0.58]) {
    const root = cone(0.28, 1.02, 7, BARK_D, x, 0.28, 0.18);
    root.rotation.x = Math.PI;
    g.add(root);
  }
  g.add(ball(0.82, LEAF_D, 0, 2.18, 0));
  g.add(ball(0.58, LEAF, -0.68, 2.06, 0.04));
  g.add(ball(0.60, MOSS, 0.70, 2.10, -0.04));
  addEyes(g, 1.46, 0.72, 0.24);
  g.add(box(0.48, 0.10, 0.08, darken(BARK_D, 0.62), 0, 1.18, 0.71));
  finish(g);
  g.scale.setScalar(0.92);
  return g;
}

export function makeForestEnemy(role: ZombieTier): ZombieGroup {
  switch (role) {
    case 'runner': return foxRunner();
    case 'brute': return stumpBrute();
    case 'stalker': return thornCaster();
    case 'exploder': return puffball();
    case 'ghost': return leafWisp();
    case 'boss': return ancientTreeBoss();
    case 'lurker':
    default: return mushroomScout();
  }
}
