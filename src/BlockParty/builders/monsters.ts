// Ported zombie builder — adapted from _lowpoly_lab/builders/monsters.js
// zombie(). The original is a static asset for an isometric showcase; here
// we lock in a per-tier height + flesh palette + boss glow tint, and expose
// the leg + arm pivot groups via userData.rig so Block Party's useFrame
// can animate the shamble and snap the arms during a bite.

import * as THREE from 'three';
import { P, box, darken, finish } from './prims';

// Horror palette — same MP values the lab uses, but inlined to keep the
// builder self-contained.
const MP = {
  rot: 0x83a05a, rotD: 0x5f7a3e, rotG: 0x4a6230,   // rotten flesh
  bone: 0xe9e2cd,                                   // exposed rib
  suitD: 0x12121a,                                  // shoes / near-black
  glowYel: 0xffd23f,
  glowRed: 0xff3322,                                // boss eyes
  glowGrn: 0x9bff5a,
};
const EYE = 0x201b18;
const glow = (c: number, ei = 0.9) => ({ e: c, ei });

export interface ZombieRig {
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Resting forward reach of the arms (rad). Bite animation interpolates
   *  from `armBase` (lurking) → 0 (fully outstretched live). */
  armBase: number;
}

export interface ZombieGroup extends THREE.Group {
  userData: { rig: ZombieRig; armBase: number };
}

export type ZombieTier = 'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'boss';

// Per-tier visual tuning. Boss gets red glowing eyes + a slightly redder rot
// tint so it reads as the boss at thumbnail size.
interface TierLook {
  scale: number;
  eyeGlow: number;
  fleshTint: number;
}

const TIER_LOOK: Record<ZombieTier, TierLook> = {
  // height ≈ ~1.6u after scale (block-party world)
  lurker:   { scale: 0.66, eyeGlow: MP.glowYel,  fleshTint: MP.rot },
  // Runner — smaller, leaner, ORANGE eye for "twitchy". Sprints.
  runner:   { scale: 0.55, eyeGlow: 0xff7820,    fleshTint: 0xb05030 },
  // Brute — slightly taller + dark crimson; the silhouette reads "tank"
  // when in a crowd of normal shamblers.
  brute:    { scale: 0.95, eyeGlow: 0xff1010,    fleshTint: 0x5a2418 },
  // SPITTER (ranged) — acid-green tint, slightly larger so it pops in
  // the crowd as "that's the shooter".
  stalker:  { scale: 0.72, eyeGlow: MP.glowGrn,  fleshTint: 0x6fb850 },
  // Exploder — unstable; angry-orange flesh + bright red eye so the
  // player knows to keep distance.
  exploder: { scale: 0.62, eyeGlow: 0xff2020,    fleshTint: 0xc05020 },
  // ~2.2x lurker, red eyes, darker rot.
  boss:     { scale: 1.45, eyeGlow: MP.glowRed,  fleshTint: darken(MP.rot, 0.78) },
};

export function makeZombie(tier: ZombieTier = 'lurker'): ZombieGroup {
  const look = TIER_LOOK[tier];
  const g = new THREE.Group() as ZombieGroup;
  const BW = 0.94, BD = 0.52, torsoH = 0.82, legH = 0.90, shoeH = 0.16;
  const lx = 0.22, hipY = shoeH + legH;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0);
  legR.position.set( lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.30, shoeH, BD - 0.02, MP.suitD, 0, shoeH / 2 - hipY, 0.04));
    L.add(box(0.30, legH,  BD - 0.08, look.fleshTint, 0, (shoeH + legH / 2) - hipY, 0));            // rotten leg
    L.add(box(0.32, legH * 0.5, BD - 0.06, darken(P.blue, 0.4), 0, (shoeH + legH * 0.32) - hipY, 0)); // torn trouser
  }

  const torsoY = hipY + torsoH / 2;
  const torso = new THREE.Group();
  torso.position.set(0.06, torsoY, 0);
  torso.rotation.z = -0.06;
  torso.add(box(BW, torsoH, BD, darken(P.green, 0.4), 0, 0, 0));                          // grimy shirt
  torso.add(box(BW * 0.5, torsoH * 0.5, 0.04, MP.rotG, -0.10, -0.10, BD / 2 + 0.01));     // rot hole
  for (let i = 0; i < 3; i++) {
    torso.add(box(0.34, 0.05, 0.05, MP.bone, -0.10, -0.20 + i * 0.13, BD / 2 + 0.03));   // ribs
  }
  g.add(torso);

  // Arms reach forward — shoulder pivots at the top of the torso, default
  // rotation.x = armBase ≈ -1.15rad (= ~66° forward of straight down).
  const ax = BW / 2 + 0.12;
  const shoulderY = torsoY + torsoH / 2 - 0.08;
  const armH = torsoH + 0.30;
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0);
  armR.position.set( ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(0.22, armH, BD - 0.12, look.fleshTint, 0, -armH / 2 + 0.08, 0));
    A.add(box(0.24, 0.18, 0.20, MP.rotD, 0, -armH + 0.12, 0));                    // limp hand
  }

  // Head — lolling, sunken sockets with glowing eyes (red for boss).
  const HW = 0.52, HH = 0.56, HDP = 0.48;
  const head = new THREE.Group();
  head.position.set(-0.04, torsoY + torsoH / 2 + 0.06 + HH / 2, 0);
  head.rotation.z = 0.12;
  head.add(box(HW, HH, HDP, look.fleshTint, 0, 0, 0));
  const fz = HDP / 2 + 0.01;
  for (const sx of [-1, 1]) {
    head.add(box(0.14, 0.12, 0.04, MP.rotG, sx * HW * 0.24, 0.06, fz));                                  // socket
    head.add(box(0.07, 0.07, 0.04, look.eyeGlow, sx * HW * 0.24, 0.06, fz + 0.01, glow(look.eyeGlow)));   // glowing eye
  }
  head.add(box(0.06, 0.05, 0.05, EYE, 0, 0.0, fz));                                  // nose hole
  head.add(box(HW - 0.10, 0.18, HDP - 0.08, MP.rotG, 0, -HH / 2 - 0.04, 0.02));     // hanging jaw
  for (let i = -1; i <= 1; i++) {
    head.add(box(0.05, 0.08, 0.04, P.white, i * 0.12, -HH / 2 + 0.02, fz));         // teeth
  }
  head.add(box(HW + 0.02, 0.16, HDP + 0.02, darken(P.green, 0.3), 0, HH / 2 - 0.02, 0)); // matted hair
  g.add(head);

  // Attach rig metadata + rest pose. armBase = -1.15rad lurking reach.
  const armBase = -1.15;
  legL.rotation.x = 0;
  legR.rotation.x = 0;
  armL.rotation.x = armBase;
  armR.rotation.x = armBase;
  g.add(legL); g.add(legR); g.add(armL); g.add(armR);
  g.userData = { rig: { legL, legR, armL, armR, armBase }, armBase };

  finish(g);
  // Apply per-tier height scale at the group level so the strike-reach
  // visualization scales naturally with body size.
  g.scale.setScalar(look.scale);

  return g;
}

// Iterate every material in a zombie group and flash it white. Used for the
// per-bullet hit response. Returns a disposer that restores the original
// colors. Caller can hold this and call it when the flash window expires.
export function flashWhite(group: THREE.Group, flash01: number) {
  // Walk meshes; for each, store and lerp its emissive toward white based on
  // flash01 (0 = normal, 1 = full white).
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.emissive) continue;
      // Cache the natural emissive on first call so we restore correctly.
      const ud = (mat as any).__bp_origEmissive as THREE.Color | undefined;
      const natural = ud ?? std.emissive.clone();
      if (!ud) (mat as any).__bp_origEmissive = natural;
      const naturalI = (mat as any).__bp_origEi ?? std.emissiveIntensity;
      if ((mat as any).__bp_origEi == null) (mat as any).__bp_origEi = naturalI;
      // Lerp toward white.
      std.emissive.copy(natural).lerp(new THREE.Color('white'), flash01);
      std.emissiveIntensity = naturalI + flash01 * 3.2;
    }
  });
}
