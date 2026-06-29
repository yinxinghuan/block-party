// Ported zombie builder — adapted from _lowpoly_lab/builders/monsters.js
// zombie(). The original is a static asset for an isometric showcase; here
// we lock in a per-tier height + flesh palette + boss glow tint, and expose
// the leg + arm pivot groups via userData.rig so Block Party's useFrame
// can animate the shamble and snap the arms during a bite.

import * as THREE from 'three';
import { P, MP_HORROR, box, cyl, cone, darken, finish } from './prims';

// Horror palette — aliased from MP_HORROR so the ported builders look
// exactly like the lab's reference.
const MP = MP_HORROR;
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
  userData: { rig?: ZombieRig; armBase?: number; isSprite?: boolean };
}

export type ZombieTier = 'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss';

// Per-tier visual tuning. Boss gets red glowing eyes + a slightly redder rot
// tint so it reads as the boss at thumbnail size.
interface TierLook {
  scale: number;
  eyeGlow: number;
  fleshTint: number;
}

const TIER_LOOK: Record<ZombieTier, TierLook> = {
  lurker:   { scale: 0.66, eyeGlow: MP.glowYel,  fleshTint: MP.rot },
  runner:   { scale: 0.55, eyeGlow: 0xff7820,    fleshTint: 0xb05030 },
  brute:    { scale: 0.95, eyeGlow: 0xff1010,    fleshTint: 0x5a2418 },
  stalker:  { scale: 0.72, eyeGlow: MP.glowGrn,  fleshTint: 0x6fb850 },
  exploder: { scale: 0.62, eyeGlow: 0xff2020,    fleshTint: 0xc05020 },
  // Ghost — only used by makeZombie if it ever falls through; the real
  // ghost builder is makeGhost which doesn't use zombie geometry at all.
  ghost:    { scale: 0.66, eyeGlow: MP.glowPale, fleshTint: MP.spectre },
  // Boss now uses the vampire builder; this entry is only here to keep
  // the TierLook record total. The vampire's own colors live in its
  // builder.
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

// ─── PORTED MONSTERS — werewolf, skeleton, mummy ────────────────────────
// All keep the same userData.rig shape so Scene.tsx's shamble/strike
// animation code Just Works on them.

interface RiggedGroup extends THREE.Group {
  userData: { rig: ZombieRig; armBase: number };
}

function attachRig(g: RiggedGroup, legL: THREE.Group, legR: THREE.Group, armL: THREE.Group, armR: THREE.Group, armBase: number) {
  legL.rotation.x = 0;
  legR.rotation.x = 0;
  armL.rotation.x = armBase;
  armR.rotation.x = armBase;
  g.add(legL); g.add(legR); g.add(armL); g.add(armR);
  g.userData = { rig: { legL, legR, armL, armR, armBase }, armBase };
}

// WEREWOLF — hunched, forward muzzle, claws. Sprints (used for runners).
export function makeWerewolf(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 1.18, BD = 0.62, torsoH = 0.92, legH = 0.66, shoeH = 0.14;
  const lx = 0.30, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.40, 0.16, 0.40, MP.furD, 0, 0.08 - hipY, 0.10));
    for (let c = -1; c <= 1; c++) L.add(box(0.07, 0.06, 0.10, MP.bone, c * 0.12, 0.04 - hipY, 0.30));
    L.add(box(0.34, legH, BD - 0.16, MP.fur, 0, (shoeH + legH / 2) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  const torso = new THREE.Group();
  torso.position.set(0, torsoY, 0); torso.rotation.x = 0.20;
  torso.add(box(BW, torsoH, BD, MP.fur, 0, 0, 0));
  torso.add(box(BW * 0.6, 0.40, 0.06, MP.furL, 0, 0.05, BD / 2 + 0.01));
  torso.add(box(BW + 0.10, 0.34, BD * 0.7, MP.furD, 0, torsoH / 2 + 0.02, -0.06));
  g.add(torso);
  const ax = BW / 2 + 0.12, shoulderY = torsoY + torsoH / 2 - 0.10, armH = torsoH + 0.40;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0.04); armR.position.set(ax, shoulderY, 0.04);
  for (const A of [armL, armR]) {
    A.add(box(0.26, armH, 0.28, MP.fur, 0, -armH / 2 + 0.10, 0));
    A.add(box(0.30, 0.18, 0.30, MP.furD, 0, -armH + 0.16, 0.06));
    for (let c = -1; c <= 1; c++) A.add(box(0.06, 0.05, 0.13, MP.bone, c * 0.10, -armH + 0.12, 0.22));
  }
  const tail = box(0.20, 0.20, 0.66, MP.furD, 0, torsoY - 0.10, -BD / 2 - 0.24);
  tail.rotation.x = -0.5; g.add(tail);
  const HW = 0.56, HH = 0.50, HDP = 0.52;
  const headY = torsoY + torsoH / 2 + 0.04, headZ = 0.18;
  g.add(box(HW, HH, HDP, MP.fur, 0, headY, headZ));
  g.add(box(0.34, 0.26, 0.34, MP.furL, 0, headY - 0.08, headZ + HDP / 2 + 0.10));
  g.add(box(0.16, 0.12, 0.10, EYE, 0, headY - 0.02, headZ + HDP / 2 + 0.28));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.12, 0.05, P.white, sx * 0.09, headY - 0.18, headZ + HDP / 2 + 0.20));
  for (const sx of [-1, 1]) g.add(cone(0.16, 0.34, 4, MP.furD, sx * 0.20, headY + HH / 2 + 0.14, headZ - 0.04));
  const eyeY = headY + 0.08;
  for (const sx of [-1, 1]) g.add(box(0.10, 0.07, 0.04, MP.glowYel, sx * 0.15, eyeY, headZ + HDP / 2 + 0.01, { e: MP.glowYel, ei: 0.9 }));
  attachRig(g, legL, legR, armL, armR, 0.28);
  finish(g);
  return g;
}

// SKELETON — bare bones with spine + ribs. Brute tier.
export function makeSkeleton(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const bone = MP.bone, bD = MP.boneD;
  const shoeH = 0.12, legH = 0.92, lx = 0.20, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.24, shoeH, 0.32, bD, 0, shoeH / 2 - hipY, 0.06));
    L.add(cyl(0.07, 0.07, legH * 0.5, 6, bone, 0, (shoeH + legH * 0.27) - hipY, 0));
    L.add(box(0.10, 0.10, 0.10, bD, 0, (shoeH + legH * 0.52) - hipY, 0));
    L.add(cyl(0.08, 0.08, legH * 0.5, 6, bone, 0, (shoeH + legH * 0.78) - hipY, 0));
  }
  g.add(box(0.46, 0.22, 0.30, bone, 0, hipY + 0.05, 0));
  const ribBase = hipY + 0.20;
  g.add(box(0.10, 0.86, 0.12, bD, 0, ribBase + 0.40, -0.06));
  const ribW = [0.52, 0.58, 0.56, 0.48];
  ribW.forEach((w, i) => g.add(box(w, 0.07, 0.34, bone, 0, ribBase + 0.10 + i * 0.18, 0.02)));
  g.add(box(0.40, 0.16, 0.30, bone, 0, ribBase + 0.82, 0));
  const shoulderY = ribBase + 0.86, ax = 0.40;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(cyl(0.06, 0.06, 0.46, 6, bone, 0, -0.20, 0));
    A.add(box(0.09, 0.09, 0.09, bD, 0, -0.44, 0));
    A.add(cyl(0.055, 0.055, 0.42, 6, bone, 0, -0.66, 0.02));
    for (let c = -1; c <= 1; c++) A.add(box(0.04, 0.12, 0.04, bone, c * 0.06, -0.92, 0.03));
  }
  const HW = 0.50, HH = 0.50, HDP = 0.46;
  const headY = shoulderY + 0.10 + HH / 2;
  g.add(box(HW, HH, HDP, bone, 0, headY, 0));
  g.add(box(HW - 0.06, 0.18, HDP - 0.04, bD, 0, headY - HH / 2 + 0.08, 0.02));
  const fz = HDP / 2 + 0.01;
  for (const sx of [-1, 1]) g.add(box(0.15, 0.16, 0.06, EYE, sx * 0.14, headY + 0.06, fz));
  g.add(box(0.07, 0.10, 0.05, EYE, 0, headY - 0.04, fz));
  for (let i = -2; i <= 2; i++) g.add(box(0.045, 0.09, 0.04, bD, i * 0.09, headY - HH / 2 + 0.04, fz));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// MUMMY — wrapped corpse with bandage layers + one glowing eye. Spitter.
export function makeMummy(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const shoeH = 0.16, legH = 0.86, lx = 0.21, BD = 0.50, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.32, shoeH, BD, MP.bandD, 0, shoeH / 2 - hipY, 0.04));
    for (let i = 0; i < 5; i++) {
      const c = i % 2 ? MP.band : MP.bandD; const off = (i % 2 ? 0.02 : -0.02);
      L.add(box(0.32, 0.16, BD - 0.06, c, off, (shoeH + 0.08 + i * 0.16) - hipY, 0));
    }
  }
  const torsoY = hipY, BW = 0.96, torsoH = 0.84;
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? MP.band : MP.bandD; const w = BW - (i % 3) * 0.04; const off = (i % 2 ? 0.03 : -0.03);
    g.add(box(w, 0.16, BD, c, off, torsoY + 0.09 + i * 0.15, 0));
  }
  const flap = box(0.14, 0.42, 0.05, MP.bandD, 0.20, torsoY + 0.30, BD / 2 + 0.02);
  flap.rotation.z = 0.4; g.add(flap);
  const ax = BW / 2 + 0.12, shoulderY = torsoY + torsoH - 0.06;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    for (let i = 0; i < 5; i++) {
      const c = i % 2 ? MP.band : MP.bandD;
      A.add(box(0.22, 0.16, 0.24, c, 0, -0.08 - i * 0.15, 0));
    }
    A.add(box(0.06, 0.34, 0.04, MP.band, 0, -0.86, 0.10));
  }
  const HW = 0.52, HH = 0.58, HDP = 0.48;
  const headY = torsoY + torsoH + 0.06 + HH / 2;
  for (let i = 0; i < 4; i++) {
    const c = i % 2 ? MP.band : MP.bandD; const off = (i % 2 ? 0.02 : -0.02);
    g.add(box(HW, 0.16, HDP, c, off, headY - HH / 2 + 0.08 + i * 0.15, 0));
  }
  const fz = HDP / 2 + 0.01;
  g.add(box(0.18, 0.06, 0.04, EYE, -0.06, headY + 0.04, fz));
  g.add(box(0.09, 0.05, 0.04, MP.glowGrn, -0.06, headY + 0.04, fz + 0.01, { e: MP.glowGrn, ei: 0.9 }));
  const tail = box(0.10, 0.40, 0.05, MP.band, -HW / 2 - 0.02, headY - 0.10, 0.04);
  tail.rotation.z = -0.3; g.add(tail);
  attachRig(g, legL, legR, armL, armR, -1.1);
  finish(g);
  return g;
}

// GHOST — legless wailing spectre with a glowing spectral core. No rig
// (no legs to swing) so we hand back a fake rig where all 4 pivots are
// empty groups — the existing shamble code can spin them harmlessly.
export function makeGhost(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const sheet = MP.spectre, op = 0.62;
  const baseY = 0.55;
  const BW = 0.92, BD = 0.46;
  g.add(box(BW, 0.70, BD, sheet, 0, baseY + 0.95, 0, { o: op }));
  g.add(box(BW - 0.10, 0.40, BD - 0.04, sheet, 0, baseY + 0.50, 0, { o: op }));
  const tails = [-0.30, 0, 0.30]; const th = [0.34, 0.46, 0.30];
  tails.forEach((tx, i) => g.add(box(0.22, th[i], BD - 0.10, sheet, tx, baseY + 0.20 - (0.46 - th[i]) / 2, 0, { o: op })));
  for (const sx of [-1, 1]) {
    const arm = box(0.18, 0.46, 0.22, sheet, sx * (BW / 2 + 0.06), baseY + 0.92, 0.04, { o: op });
    arm.rotation.z = sx * 0.5;
    g.add(arm);
  }
  const headY = baseY + 0.95 + 0.35 + 0.26;
  g.add(box(0.66, 0.58, 0.50, sheet, 0, headY, 0, { o: op }));
  g.add(box(0.58, 0.16, 0.46, sheet, 0, headY + 0.30, 0, { o: op }));
  const fz = 0.26;
  for (const sx of [-1, 1]) g.add(box(0.15, 0.20, 0.05, EYE, sx * 0.17, headY + 0.06, fz));
  g.add(box(0.20, 0.24, 0.05, EYE, 0, headY - 0.18, fz));
  g.add(box(0.30, 0.40, 0.10, MP.glowPale, 0, baseY + 0.80, 0, { e: MP.glowPale, ei: 0.9 }));
  // Stub rig — ghost doesn't have rotateable limbs, but Scene.tsx's
  // useFrame happily writes rotations onto empty groups.
  const stub = (): THREE.Group => new THREE.Group();
  attachRig(g, stub(), stub(), stub(), stub(), 0);
  finish(g);
  return g;
}

// VAMPIRE — gaunt suited noble with a blood cape, fanged head, slicked
// hair. The night-3 BOSS now, replacing the scaled-up zombie.
export function makeVampire(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 0.86, BD = 0.48, torsoH = 0.88, legH = 0.96, shoeH = 0.16;
  const lx = 0.22, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.30, shoeH, BD + 0.04, MP.suitD, 0, shoeH / 2 - hipY, 0.04));
    L.add(box(0.26, legH, BD - 0.10, MP.suit, 0, (shoeH + legH / 2) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, MP.suit, 0, torsoY, 0));
  g.add(box(0.30, torsoH * 0.84, 0.04, P.cream, 0, torsoY + 0.02, BD / 2 + 0.01));
  g.add(box(0.16, 0.10, 0.05, MP.blood, 0, torsoY + torsoH * 0.30, BD / 2 + 0.03));
  const ax = BW / 2 + 0.14, shoulderY = torsoY + torsoH / 2, armH = torsoH + 0.30;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) A.add(box(0.20, armH, BD - 0.10, MP.suit, 0, -armH / 2 + 0.10, 0));
  g.add(box(BW + 0.28, torsoH + legH * 0.7, 0.06, MP.bloodD, 0, torsoY - 0.10, -BD / 2 - 0.04));
  for (const sx of [-1, 1]) {
    const wing = box(0.10, 0.62, 0.34, MP.blood, sx * (BW / 2 + 0.04), torsoY + torsoH / 2 + 0.30, -0.12);
    wing.rotation.z = sx * -0.34;
    g.add(wing);
  }
  const HW = 0.50, HH = 0.62, HDP = 0.46;
  const headY = torsoY + torsoH / 2 + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, MP.pale, 0, headY, 0));
  g.add(box(HW - 0.06, 0.14, HDP - 0.04, MP.paleD, 0, headY - HH / 2 + 0.10, 0.02));
  const fz = HDP / 2 + 0.01, eyeY = headY + 0.05, eyeX = HW * 0.25;
  for (const sx of [-1, 1]) g.add(box(0.12, 0.08, 0.04, MP.glowRed, sx * eyeX, eyeY, fz, { e: MP.glowRed, ei: 1.1 }));
  for (const sx of [-1, 1]) g.add(box(0.05, 0.10, 0.04, P.white, sx * 0.08, headY - HH / 2 + 0.04, fz));
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.04, 0.18, HDP + 0.04, MP.suit, 0, topHead + 0.04, 0));
  g.add(box(HW + 0.04, 0.30, 0.12, MP.suit, 0, headY + 0.10, -HDP * 0.5));
  g.add(box(0.12, 0.16, 0.05, MP.suit, 0, headY + HH * 0.5 - 0.04, fz - 0.01));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// ──────────────────────────────────────────────────────────────────────
// BOSS-VARIANT BUILDERS — distinct silhouettes for the "elite/boss"
// roster the player meets at higher cycles. Each one is also a unique
// AI skill carrier (charge / beam / shield) wired in useGameLoop.
// Ported from _lowpoly_lab/builders/{villains,mechs,mythic}.js.
// ──────────────────────────────────────────────────────────────────────

// SWAT enforcer — tactical kit + riot shield. Carrier of the SHIELD skill.
export function makeSwat(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const tactBlk = 0x1a1c20, tactDk = 0x101116;
  const kevlar  = 0x2c2f36, kevlarD = 0x1b1d22;
  const visor   = 0x6fb3ff;
  const shield  = 0xe9e5d6, shieldD = 0xc7c3b4;
  const hazardY = 0xf4d020;
  const warnR   = 0xff3030;
  const rubber  = 0x0c0c10;
  const gunM    = 0x2a2a30;
  const BW = 0.96, BD = 0.56, torsoH = 0.90, legH = 0.86, bootH = 0.20;
  const lx = 0.24, hipY = bootH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.36, bootH, BD + 0.06, rubber, 0, bootH / 2 - hipY, 0.04));
    L.add(box(0.34, bootH * 0.40, BD + 0.02, tactDk, 0, bootH * 0.85 - hipY, 0.04));
    L.add(box(0.28, legH, BD - 0.08, tactBlk, 0, (bootH + legH / 2) - hipY, 0));
    L.add(box(0.30, 0.24, 0.12, kevlar, 0, hipY * 0.20 - hipY, BD / 2 - 0.04));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, tactBlk, 0, torsoY, 0));
  g.add(box(BW + 0.06, torsoH * 0.92, BD + 0.06, kevlar, 0, torsoY, 0));
  g.add(box(0.20, 0.18, 0.05, hazardY, 0, torsoY + torsoH * 0.32, BD / 2 + 0.04));
  g.add(box(0.06, 0.06, 0.05, warnR, BW * 0.30, torsoY + torsoH * 0.32, BD / 2 + 0.04, { e: warnR, ei: 0.85 }));
  for (const xx of [-0.22, 0.0, 0.22]) {
    g.add(box(0.14, 0.16, 0.06, kevlarD, xx, torsoY - torsoH * 0.10, BD / 2 + 0.04));
  }
  g.add(box(BW + 0.10, 0.10, BD + 0.08, tactDk, 0, hipY - 0.04, 0));
  const ax = BW / 2 + 0.16, shoulderY = torsoY + torsoH / 2, armH = torsoH + 0.28;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(0.32, 0.20, 0.34, kevlar, 0, -0.05, 0));
    A.add(box(0.22, armH, BD - 0.16, tactBlk, 0, -armH / 2 + 0.10, 0));
    A.add(box(0.24, 0.20, 0.20, rubber, 0, -armH + 0.18, 0));
  }
  // Riot shield — wide panel on LEFT arm. Named for the skill system to
  // grab and orient (raised / lowered).
  const shieldGrp = new THREE.Group();
  shieldGrp.name = 'shield';
  shieldGrp.position.set(0.10, -armH / 2 + 0.40, BD / 2 + 0.18);
  shieldGrp.add(box(1.10, 1.50, 0.10, shield, 0, 0, 0));
  shieldGrp.add(box(1.18, 0.10, 0.14, shieldD, 0, 0.70, 0));
  shieldGrp.add(box(1.18, 0.10, 0.14, shieldD, 0, -0.70, 0));
  shieldGrp.add(box(0.20, 0.10, 0.10, tactDk, 0, 0.04, 0.055));
  shieldGrp.add(box(0.06, 0.30, 0.16, hazardY, -0.40, 0, 0));
  armL.add(shieldGrp);
  const gun = new THREE.Group();
  gun.position.set(0.02, -armH + 0.10, 0.34);
  gun.add(box(0.16, 0.16, 0.66, gunM, 0, 0, 0));
  gun.add(box(0.10, 0.20, 0.16, tactDk, 0, -0.08, -0.12));
  gun.add(box(0.06, 0.06, 0.12, warnR, 0, 0.02, 0.40, { e: warnR, ei: 0.85 }));
  armR.add(gun);
  const HW = 0.62, HH = 0.62, HDP = 0.56;
  const headY = torsoY + torsoH / 2 + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, tactBlk, 0, headY, 0));
  g.add(box(HW + 0.06, HH * 0.38, HDP + 0.06, tactDk, 0, headY + HH * 0.30, 0));
  g.add(box(HW - 0.06, 0.26, 0.04, visor, 0, headY - 0.02, HDP / 2 + 0.03, { e: visor, ei: 0.85 }));
  g.add(box(HW - 0.10, 0.06, 0.04, 0x3a72b3, 0, headY - 0.15, HDP / 2 + 0.04));
  g.add(box(HW - 0.20, 0.10, 0.20, tactDk, 0, headY - HH / 2 + 0.06, HDP / 2 - 0.02));
  g.add(box(0.04, 0.22, 0.04, gunM, HW / 2 - 0.06, headY + HH / 2 + 0.12, -HDP / 2 + 0.08));
  g.add(box(0.04, 0.06, 0.04, warnR, HW / 2 - 0.06, headY + HH / 2 + 0.26, -HDP / 2 + 0.08, { e: warnR, ei: 0.85 }));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// COMBAT MECH — bipedal walker with chest core + dual cannons. Carrier
// of the BEAM skill (long-telegraph laser).
export function makeCombatMech(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const hull = 0x46484d, hullD = 0x2d2e33, hullL = 0x6a6e76;
  const joint = 0x18181c;
  const core = 0xff7028, coreD = 0xc44820;
  const sensor = 0x4fd2ff;
  const amber = 0xffaa30;
  const warnR = 0xff3030;
  const BW = 1.30, BD = 0.80, torsoH = 1.10, legH = 1.05, footH = 0.22;
  const lx = 0.34, hipY = footH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.52, footH, BD + 0.10, hullD, 0, footH / 2 - hipY, 0.06));
    L.add(box(0.46, 0.06, BD, amber, 0, footH * 0.20 - hipY, 0.10));
    L.add(box(0.36, legH * 0.5, BD - 0.18, hull, 0, footH + legH * 0.25 - hipY, 0));
    L.add(box(0.38, 0.16, BD - 0.10, joint, 0, footH + legH * 0.50 - hipY, 0));
    L.add(box(0.42, legH * 0.42, BD - 0.04, hull, 0, footH + legH * 0.74 - hipY, 0));
    L.add(box(0.04, legH * 0.42, 0.20, amber, 0.21, footH + legH * 0.74 - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, hull, 0, torsoY, 0));
  g.add(box(BW + 0.10, torsoH * 0.30, BD + 0.06, hullD, 0, torsoY + torsoH * 0.30, 0));
  g.add(box(BW + 0.06, torsoH * 0.18, BD + 0.02, hullD, 0, torsoY - torsoH * 0.40, 0));
  g.add(box(0.42, 0.32, 0.10, coreD, 0, torsoY, BD / 2 + 0.01));
  // Core mesh is named so the beam-charge effect can pulse it.
  const coreMesh = box(0.32, 0.22, 0.08, core, 0, torsoY, BD / 2 + 0.06, { e: core, ei: 1.0 });
  coreMesh.name = 'core';
  g.add(coreMesh);
  for (const sx of [-1, 1]) {
    g.add(box(0.04, 0.30, 0.10, amber, sx * (BW / 2 + 0.02), torsoY - 0.05, 0, { e: amber, ei: 0.85 }));
    g.add(box(0.42, 0.36, BD - 0.04, hull, sx * (BW / 2 + 0.18), torsoY + torsoH / 2 - 0.06, 0));
    g.add(box(0.44, 0.06, BD - 0.04, amber, sx * (BW / 2 + 0.18), torsoY + torsoH / 2 + 0.16, 0));
  }
  const ax = BW / 2 + 0.36, shoulderY = torsoY + torsoH / 2 - 0.22, armH = torsoH + 0.20;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(0.32, armH * 0.40, 0.36, hull, 0, -armH * 0.20 + 0.04, 0));
    A.add(box(0.36, 0.16, 0.40, joint, 0, -armH * 0.42 + 0.04, 0));
    A.add(box(0.36, armH * 0.40, 0.42, hullL, 0, -armH * 0.66 + 0.04, 0));
    A.add(box(0.28, 0.28, 0.62, hullD, 0, -armH + 0.10, 0.28));
    A.add(box(0.18, 0.18, 0.10, core, 0, -armH + 0.10, 0.62, { e: core, ei: 1.0 }));
    A.add(box(0.06, 0.08, 0.30, amber, 0, -armH + 0.22, 0.36));
  }
  const HW = 0.46, HH = 0.30, HDP = 0.50;
  const headY = torsoY + torsoH / 2 + 0.12 + HH / 2;
  g.add(box(HW, HH, HDP, hullD, 0, headY, 0));
  // Named so we can highlight the sensor while beam is charging.
  const eye = box(HW - 0.08, 0.16, 0.04, sensor, 0, headY, HDP / 2 + 0.02, { e: sensor, ei: 1.0 });
  eye.name = 'sensor';
  g.add(eye);
  for (const sx of [-1, 1]) {
    g.add(box(0.04, 0.30, 0.04, hullD, sx * (HW / 2 - 0.04), headY + HH / 2 + 0.16, -HDP / 2 + 0.08));
    g.add(box(0.04, 0.06, 0.04, warnR, sx * (HW / 2 - 0.04), headY + HH / 2 + 0.32, -HDP / 2 + 0.08, { e: warnR, ei: 0.85 }));
  }
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// MINOTAUR — bull-headed warrior, broad torso, horns + axe. Carrier of
// the CHARGE skill (telegraph → high-speed line dash → stun).
export function makeMinotaur(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const fur = 0x6b4a2e, furD = 0x4a3320, furL = 0x8a6740;
  const hide = 0x9d7148;
  const horn = 0xe6dec3, hornD = 0xc3b994;
  const iron = 0x44464d, ironD = 0x2a2c30;
  const brass = 0xc78a2f;
  const loin = 0x4a342a, loinTrim = 0xa86628;
  const bloodR = 0xa01a1a;
  const BW = 1.28, BD = 0.66, torsoH = 1.04, legH = 0.92, hoofH = 0.18;
  const lx = 0.30, hipY = hoofH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.36, hoofH, BD + 0.10, horn, 0, hoofH / 2 - hipY, 0.10));
    L.add(box(0.36, hoofH * 0.65, 0.16, hornD, 0, hoofH / 2 - hipY, BD / 2 + 0.08));
    L.add(box(0.38, legH * 0.70, BD - 0.04, fur, 0, (hoofH + legH * 0.35) - hipY, 0));
    L.add(box(0.42, legH * 0.20, BD, furD, 0, (hoofH + legH * 0.05) - hipY, 0));
    L.add(box(0.42, legH * 0.18, BD + 0.02, furD, 0, (hoofH + legH * 0.85) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, hide, 0, torsoY, 0));
  g.add(box(BW - 0.08, torsoH * 0.32, BD - 0.02, furL, 0, torsoY + torsoH * 0.28, 0.02));
  g.add(box(BW + 0.08, 0.04, BD + 0.06, fur, 0, torsoY + torsoH * 0.50 - 0.02, 0));
  g.add(box(BW + 0.10, 0.30, BD + 0.06, loin, 0, hipY - 0.08, 0));
  g.add(box(BW + 0.14, 0.06, BD + 0.08, loinTrim, 0, hipY + 0.06, 0));
  for (const xx of [-0.30, -0.10, 0.10, 0.30]) {
    g.add(box(0.06, 0.06, 0.04, brass, xx, hipY + 0.06, BD / 2 + 0.04, { e: brass, ei: 0.85 }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.36, 0.24, BD - 0.04, furD, sx * (BW / 2 + 0.10), torsoY + torsoH / 2 - 0.10, 0));
  }
  const ax = BW / 2 + 0.20, shoulderY = torsoY + torsoH / 2 - 0.10, armH = torsoH + 0.40;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(0.30, armH * 0.50, BD - 0.18, fur, 0, -armH * 0.25 + 0.04, 0));
    A.add(box(0.34, 0.10, BD - 0.10, furD, 0, -armH * 0.50 + 0.04, 0));
    A.add(box(0.30, armH * 0.42, BD - 0.16, furL, 0, -armH * 0.74 + 0.04, 0));
    A.add(box(0.36, 0.16, BD - 0.08, loinTrim, 0, -armH + 0.18, 0));
    A.add(box(0.34, 0.18, BD - 0.10, hide, 0, -armH + 0.04, 0));
  }
  const axe = new THREE.Group();
  axe.position.set(0.04, -armH + 0.12, 0.30);
  axe.add(box(0.10, 0.10, 1.00, furD, 0, 0, 0));
  for (const zz of [-0.32, 0.0, 0.32]) {
    axe.add(box(0.12, 0.12, 0.06, brass, 0, 0, zz));
  }
  axe.add(box(0.06, 0.62, 0.46, iron, 0, 0.20, 0.66));
  axe.add(box(0.06, 0.50, 0.38, iron, 0, 0.20, 0.96));
  axe.add(box(0.06, 0.30, 0.18, ironD, 0, 0.30, 1.08));
  axe.add(box(0.04, 0.04, 0.40, horn, 0, 0.50, 0.70, { e: brass, ei: 0.85 }));
  armR.add(axe);
  const HW = 0.62, HH = 0.58, HDP = 0.62;
  const headY = torsoY + torsoH / 2 + 0.04 + HH / 2;
  g.add(box(HW, HH, HDP, fur, 0, headY, 0));
  g.add(box(HW - 0.10, 0.20, 0.30, hide, 0, headY - HH * 0.20, HDP / 2 + 0.04));
  g.add(box(0.18, 0.10, 0.10, horn, 0, headY - HH * 0.30, HDP / 2 + 0.22));
  for (const sx of [-1, 1]) {
    g.add(box(0.10, 0.06, 0.04, bloodR, sx * 0.14, headY + 0.06, HDP / 2 + 0.02, { e: bloodR, ei: 0.85 }));
  }
  for (const sx of [-1, 1]) {
    const hornGrp = new THREE.Group();
    hornGrp.position.set(sx * (HW / 2 - 0.02), headY + HH * 0.30, 0);
    hornGrp.rotation.z = sx * 0.30;
    hornGrp.add(box(0.18, 0.16, 0.30, horn, sx * 0.22, 0.10, 0));
    hornGrp.add(box(0.14, 0.14, 0.26, horn, sx * 0.42, 0.18, 0));
    hornGrp.add(box(0.10, 0.10, 0.22, hornD, sx * 0.58, 0.26, 0));
    g.add(hornGrp);
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.10, 0.14, 0.04, furD, sx * (HW / 2 - 0.02), headY + 0.04, -HDP / 2 + 0.04));
  }
  g.add(box(0.30, 0.14, 0.20, furD, 0, headY + HH / 2 + 0.04, 0));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// VIKING RAIDER — replaces SWAT visually as the SHIELD carrier. Same
// rig contract; the named 'shield' group on left arm is what the skill
// telegraph could grab/orient if needed.
export function makeViking(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const fur=0x6b4a2e, furD=0x4a3320;
  const leather=0x4a342a, leatherD=0x2a1d18;
  const skin=0xe2a877, skinD=0xb78550;
  const beard=0xa9774a, hair=0x7c5230;
  const horn=0xe6dec3, hornD=0xc3b994;
  const iron=0x44464d, ironD=0x2a2c30;
  const brass=0xc78a2f;
  const shieldWood=0x7c5230, shieldRim=0x3b3b44;
  const shieldGlyph=0xb05de8;
  const eyeC=0x201b18;
  const BW = 1.06, BD = 0.58, torsoH = 0.92, legH = 0.86, bootH = 0.20;
  const lx = 0.24, hipY = bootH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.32, bootH, BD + 0.04, leatherD, 0, bootH / 2 - hipY, 0.04));
    L.add(box(0.32, 0.06, BD, fur, 0, bootH + 0.04 - hipY, 0));
    L.add(box(0.30, legH - 0.10, BD - 0.06, leather, 0, (bootH + legH * 0.5) - hipY, 0));
    L.add(box(0.32, 0.04, BD - 0.02, brass, 0, (bootH + legH * 0.85) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, fur, 0, torsoY, 0));
  g.add(box(BW - 0.04, torsoH * 0.70, BD - 0.02, iron, 0, torsoY + 0.02, 0));
  g.add(box(BW + 0.08, 0.10, BD + 0.06, leatherD, 0, hipY - 0.04, 0));
  g.add(box(0.20, 0.16, 0.06, brass, 0, hipY - 0.02, BD / 2 + 0.04, { e: brass, ei: 0.85 }));
  for (const sx of [-1, 1]) {
    g.add(box(0.30, 0.18, BD - 0.04, furD, sx * (BW / 2 + 0.06), torsoY + torsoH / 2 - 0.04, 0));
  }
  const ax = BW / 2 + 0.16, shoulderY = torsoY + torsoH / 2 - 0.04, armH = torsoH + 0.34;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(0.26, armH * 0.45, BD - 0.18, fur, 0, -armH * 0.225 + 0.04, 0));
    A.add(box(0.22, armH * 0.40, BD - 0.20, skin, 0, -armH * 0.68 + 0.04, 0));
    A.add(box(0.28, 0.18, BD - 0.10, leatherD, 0, -armH + 0.18, 0));
    A.add(box(0.26, 0.16, BD - 0.12, skinD, 0, -armH + 0.04, 0));
  }
  // Round shield on LEFT arm — concentric boxes approximating a disc
  const shield = new THREE.Group();
  shield.name = 'shield';
  shield.position.set(0.16, -armH / 2 + 0.40, BD / 2 + 0.16);
  shield.add(box(1.12, 1.12, 0.10, shieldWood, 0, 0, 0));
  shield.add(box(1.18, 0.10, 0.14, shieldRim,  0,  0.56, 0));
  shield.add(box(1.18, 0.10, 0.14, shieldRim,  0, -0.56, 0));
  shield.add(box(0.10, 1.18, 0.14, shieldRim,  0.56,  0, 0));
  shield.add(box(0.10, 1.18, 0.14, shieldRim, -0.56,  0, 0));
  shield.add(box(0.24, 0.24, 0.12, brass, 0, 0, 0.07));
  shield.add(box(0.12, 0.96, 0.012, shieldGlyph, 0, 0, 0.06));
  shield.add(box(0.96, 0.12, 0.012, shieldGlyph, 0, 0, 0.06));
  armL.add(shield);
  // Battle axe in RIGHT arm
  const axe = new THREE.Group();
  axe.position.set(0.02, -armH + 0.14, 0.26);
  axe.add(box(0.10, 0.10, 0.78, leatherD, 0, 0, 0));
  for (const zz of [-0.20, 0.20]) axe.add(box(0.12, 0.12, 0.06, brass, 0, 0, zz));
  axe.add(box(0.06, 0.46, 0.32, iron, 0, 0.16, 0.52));
  axe.add(box(0.06, 0.36, 0.24, iron, 0, 0.18, 0.74));
  armR.add(axe);
  // Head + beard + horned helm
  const HW = 0.50, HH = 0.50, HDP = 0.46;
  const headY = torsoY + torsoH / 2 + 0.04 + HH / 2;
  g.add(box(HW, HH, HDP, skin, 0, headY, 0));
  g.add(box(HW - 0.10, 0.20, 0.18, beard, 0, headY - HH / 2 - 0.04, HDP / 2 - 0.06));
  g.add(box(HW - 0.14, 0.18, 0.14, beard, 0, headY - HH / 2 - 0.20, HDP / 2 - 0.08));
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.06, 0.04, eyeC, sx * 0.12, headY + 0.04, HDP / 2 + 0.02));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.10, 0.30, HDP - 0.08, hair, sx * (HW / 2 + 0.02), headY - 0.04, 0));
  }
  const helmY = headY + HH * 0.30;
  g.add(box(HW + 0.08, HH * 0.42, HDP + 0.06, iron, 0, helmY, 0));
  g.add(box(HW + 0.06, 0.10, HDP + 0.04, ironD, 0, helmY - HH * 0.25, 0));
  g.add(box(0.10, 0.30, 0.10, ironD, 0, headY - HH * 0.02, HDP / 2 + 0.04));
  for (const sx of [-1, 1]) {
    const hornGrp = new THREE.Group();
    hornGrp.position.set(sx * (HW / 2 - 0.02), helmY + HH * 0.18, 0);
    hornGrp.rotation.z = sx * -0.20;
    hornGrp.add(box(0.18, 0.22, 0.20, horn,  sx * 0.06, 0.10, 0));
    hornGrp.add(box(0.14, 0.20, 0.16, horn,  sx * 0.14, 0.30, 0));
    hornGrp.add(box(0.10, 0.18, 0.12, hornD, sx * 0.22, 0.50, 0));
    g.add(hornGrp);
  }
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// PUNK — ported from _lowpoly_lab/builders/archetypes.js. Tall mohawk +
// studded jacket + leather pants. Maps to the CHARGE skill (alongside
// minotaur) but tuned faster + shorter range — feels like a rabid
// pounce vs. minotaur's heavy thunder.
export function makePunk(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const ironD = P.ironD;
  const steel = P.steel;
  const skin = P.skin;
  const eyeC = 0x241f1c;
  const accent = P.accent;
  const slateD = darken(P.slate, 0.95);
  const BW = 0.86, BD = 0.46, torsoH = 0.80, legH = 1.04, shoeH = 0.20;
  const lx = 0.16, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.30, shoeH + 0.06, BD, ironD, 0, (shoeH + 0.06) / 2 - hipY, 0.05));
    for (let i = 0; i < 3; i++) L.add(box(0.04, 0.04, 0.04, steel, i * 0.06 - 0.06, shoeH / 2 - 0.04 - hipY, BD / 2 + 0.03));
    L.add(box(0.20, legH, BD - 0.12, slateD, 0, (shoeH + legH / 2) - hipY, 0));
    L.add(box(0.24, 0.04, BD - 0.08, steel, 0, (shoeH + legH * 0.55) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, ironD, 0, torsoY, 0));
  g.add(box(0.10, 0.20, 0.04, darken(ironD, 0.4), -0.14, torsoY + torsoH * 0.28, BD / 2 + 0.02));
  g.add(box(0.10, 0.20, 0.04, darken(ironD, 0.4),  0.14, torsoY + torsoH * 0.28, BD / 2 + 0.02));
  for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) {
    g.add(box(0.05, 0.05, 0.05, steel, c * 0.24, torsoY + 0.16 - r * 0.14, BD / 2 + 0.025));
  }
  // Belt + studs along it
  g.add(box(BW + 0.02, 0.10, BD + 0.02, ironD, 0, torsoY - torsoH / 2 + 0.05, 0));
  for (let i = -2; i <= 2; i++) g.add(box(0.05, 0.05, 0.05, steel, i * 0.16, torsoY - torsoH / 2 + 0.05, BD / 2 + 0.02));
  // Shoulder spikes
  for (const sx of [-1, 1]) for (let i = -2; i <= 2; i++) {
    const h = 0.12 + Math.abs(i) * 0.04;
    g.add(box(0.05, 0.16 + h, 0.05, steel, sx * (BW / 2 - 0.04) + i * 0.03, torsoY + torsoH / 2 + 0.08 + h / 2, i * 0.04));
  }
  // Arms — jacket sleeve over bare forearm + bracer studs
  const armW = 0.18, armH = torsoH + legH * 0.30, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.72, BD - 0.12, ironD, 0, (torsoY + torsoH / 2 - armH * 0.36) - shoulderY, 0));
    A.add(box(armW, armH * 0.28, BD - 0.12, skin,  0, (torsoY + torsoH / 2 - armH * 0.86) - shoulderY, 0));
    for (let i = 0; i < 3; i++) A.add(box(0.05, 0.05, 0.05, steel, 0.03, (torsoY + torsoH / 2 - armH * 0.40) - shoulderY - i * 0.10, BD / 2 - 0.08));
  }
  // Head + spiky teal mohawk
  const HW = 0.52, HH = 0.56, HDP = 0.46;
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.26, 0.12, 0.24, skin, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, skin, 0, headY, 0));
  // Eyes
  for (const sx of [-1, 1]) g.add(box(0.12, 0.12, 0.04, eyeC, sx * HW * 0.26, headY + 0.02, HDP / 2 + 0.01));
  // Snarl line + nose stud
  g.add(box(HW * 0.96, 0.06, 0.04, eyeC, 0, headY + 0.10, HDP / 2 + 0.012));
  g.add(box(0.05, 0.05, 0.04, steel, -HW * 0.3, headY + 0.18, HDP / 2 + 0.020));
  const topHead = headY + HH / 2;
  g.add(box(0.18, 0.18, HDP * 0.82, ironD, 0, topHead + 0.04, 0));
  // Tall teal mohawk — the silhouette anchor
  g.add(box(0.14, 0.80, HDP * 0.78, accent, 0, topHead + 0.46, 0, { e: accent, ei: 0.55 }));
  g.add(box(0.10, 0.24, HDP * 0.42, accent, 0, topHead + 0.94, 0, { e: accent, ei: 0.55 }));
  // Sideburns
  g.add(box(0.05, 0.16, HDP * 0.5, eyeC, -(HW / 2 + 0.02), topHead - 0.06, 0));
  g.add(box(0.05, 0.16, HDP * 0.5, eyeC,  (HW / 2 + 0.02), topHead - 0.06, 0));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// ──────────────────────────────────────────────────────────────────────
// V4 CULTURAL ARCHETYPES — ported from _lowpoly_lab/builders/archetypes.js.
// Each one is a Crossy-Road-style cultural caricature (NYPD cop, Clint
// Eastwood cowboy, Morticia goth, Fonzie biker, FDNY firefighter) and
// drives a unique AI skill in useGameLoop (summon / burstfire / blink /
// flank / rage). Same rig contract as the existing roster.
// ──────────────────────────────────────────────────────────────────────

const SHADE = 0x14110e;
const ARCH_EYE = 0x241f1c;

// COP — donut-eating NYPD stereotype. Carrier of the SUMMON skill (calls
// 2 lurkers nearby every 6-9s).
export function makeCop(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 1.18, BD = 0.66, torsoH = 0.86, legH = 0.82, shoeH = 0.18;
  const lx = 0.24, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.36, shoeH, BD, P.ironD,                 0, shoeH / 2 - hipY,        0.04));
    L.add(box(0.32, legH, BD - 0.10, darken(P.ironD, 0.25), 0, (shoeH + legH / 2) - hipY, 0));
    L.add(box(0.34, 0.06, BD - 0.08, P.gold,            0, (shoeH + legH * 0.50) - hipY, 0.04));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, P.blue, 0, torsoY, 0));
  g.add(box(BW + 0.04, 0.30, BD + 0.06, P.blue, 0, torsoY - torsoH * 0.32, 0));
  g.add(box(BW - 0.12, 0.10, BD + 0.10, P.blue, 0, torsoY - torsoH * 0.46, 0));
  g.add(box(0.26, 0.16, 0.04, darken(P.blue, 0.3), 0, torsoY + torsoH / 2 - 0.10, BD / 2 + 0.02));
  g.add(box(0.08, torsoH * 0.5, 0.04, P.ironD, 0, torsoY + 0.04, BD / 2 + 0.025));
  g.add(box(0.26, 0.28, 0.05, P.gold, -BW / 2 + 0.26, torsoY + 0.10, BD / 2 + 0.03));
  g.add(box(0.16, 0.18, 0.06, darken(P.gold, 0.4), -BW / 2 + 0.26, torsoY + 0.10, BD / 2 + 0.055));
  g.add(box(0.22, 0.07, 0.04, P.steel, BW / 2 - 0.20, torsoY + 0.22, BD / 2 + 0.03));
  g.add(box(BW + 0.06, 0.16, BD + 0.04, P.ironD, 0, torsoY - torsoH / 2 + 0.07, 0));
  g.add(box(0.22, 0.18, 0.06, P.gold, 0, torsoY - torsoH / 2 + 0.07, BD / 2 + 0.030));
  g.add(box(0.20, 0.26, 0.18, P.ironD,  BW / 2 + 0.10, torsoY - torsoH / 2 - 0.06, 0));
  g.add(box(0.08, 0.42, 0.08, darken(P.woodD, 0.2), -BW / 2 - 0.10, torsoY - torsoH / 2 - 0.10, 0));
  const armW = 0.26, armH = torsoH + legH * 0.22, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.66, BD - 0.06, P.blue, 0, (torsoY + torsoH / 2 - armH * 0.33) - shoulderY, 0));
    A.add(box(armW, armH * 0.34, BD - 0.06, P.skin, 0, (torsoY + torsoH / 2 - armH * 0.83) - shoulderY, 0));
  }
  // DONUT in L hand — pink ring + sprinkles (cultural prop)
  armL.add(box(0.30, 0.30, 0.18, P.petal, 0.08, -armH * 0.78, 0.18));
  armL.add(box(0.14, 0.30, 0.06, P.cream, 0.08, -armH * 0.78, 0.18));
  const sprinkleCols = [P.red, P.blue, P.gold, P.green, P.purple];
  for (let i = 0; i < 5; i++) armL.add(box(0.03, 0.05, 0.03, sprinkleCols[i], 0.04 + i * 0.05, -armH * 0.74, 0.18));
  const HW = 0.60, HH = 0.60, HDP = 0.52;
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.32, 0.12, 0.30, P.skinTan, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, P.skinTan, 0, headY, 0));
  const fz = HDP / 2 + 0.01;
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE, -HW * 0.26, headY + 0.02, fz));
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE,  HW * 0.26, headY + 0.02, fz));
  g.add(box(0.42, 0.10, 0.05, P.hairBrown, 0, headY - HH * 0.16, fz));
  g.add(box(0.08, 0.10, 0.06, P.hairBrown,  0.18, headY - HH * 0.10, fz));
  g.add(box(0.08, 0.10, 0.06, P.hairBrown, -0.18, headY - HH * 0.10, fz));
  // AVIATOR shades
  g.add(box(0.20, 0.14, 0.04, SHADE, -HW * 0.26, headY + 0.04, fz));
  g.add(box(0.20, 0.14, 0.04, SHADE,  HW * 0.26, headY + 0.04, fz));
  g.add(box(0.10, 0.04, 0.03, P.gold,        0, headY + 0.06, fz));
  // PEAKED CAP
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.06, 0.18, HDP + 0.06, darken(P.blue, 0.4), 0, topHead + 0.09, 0));
  g.add(box(HW + 0.10, 0.05, HDP + 0.10, P.ironD, 0, topHead + 0.01, 0));
  g.add(box(HW * 0.86, 0.05, 0.22, P.ironD,  0, topHead - 0.02, HDP / 2 + 0.10));
  g.add(box(0.16, 0.10, 0.04, P.gold, 0, topHead + 0.06, HDP / 2 + 0.10));
  attachRig(g, legL, legR, armL, armR, 0);
  // Pose L arm raised holding donut (after attachRig — game rebinds during
  // shamble but starting pose reads "guy with donut").
  armL.rotation.x = -0.6;
  finish(g);
  return g;
}

// COWBOY — Clint Eastwood man-with-no-name. Carrier of BURSTFIRE
// (telegraph → 3 revolver shots).
export function makeCowboy(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 1.02, BD = 0.52, torsoH = 0.78, legH = 1.04, shoeH = 0.24;
  const lx = 0.22, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.36, shoeH, BD + 0.04, P.woodD, 0, shoeH / 2 - hipY, 0.06));
    L.add(box(0.10, 0.08, 0.10, darken(P.gold, 0.3), 0, shoeH - 0.12 - hipY, BD / 2 + 0.06));
    L.add(box(0.20, 0.06, 0.06, P.steel, 0, shoeH - 0.08 - hipY, -BD / 2 - 0.04));
    for (let i = 0; i < 4; i++) L.add(box(0.03, 0.06, 0.03, P.steel, i * 0.04 - 0.06, shoeH - 0.10 - hipY, -BD / 2 - 0.08));
    L.add(box(0.32, legH, BD - 0.10, darken(P.blue, 0.6), 0, (shoeH + legH / 2) - hipY, 0));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, darken(P.blue, 0.55), 0, torsoY, 0));
  // LONG DUSTER — silhouette extender
  const dusterCol = P.woodM;
  g.add(box(BW + 0.20, 1.10, 0.10, dusterCol, 0, torsoY - 0.10, -BD / 2 - 0.04));
  g.add(box(0.16, torsoH + 0.70, BD + 0.10, dusterCol, -BW / 2 - 0.06, torsoY - 0.20, 0));
  g.add(box(0.16, torsoH + 0.70, BD + 0.10, dusterCol,  BW / 2 + 0.06, torsoY - 0.20, 0));
  g.add(box(0.12, torsoH + 0.40, 0.08, darken(dusterCol, 0.3), -BW * 0.30, torsoY - 0.10, BD / 2 + 0.02));
  g.add(box(0.12, torsoH + 0.40, 0.08, darken(dusterCol, 0.3),  BW * 0.30, torsoY - 0.10, BD / 2 + 0.02));
  // Poncho stripes
  const ponchoCols = [darken(P.red, 0.1), P.gold, darken(P.green, 0.2)];
  for (let i = -1; i <= 1; i++) {
    g.add(box(BW + 0.30, 0.10, BD + 0.04, ponchoCols[i + 1], 0, torsoY + torsoH / 2 - 0.04 + i * 0.10, 0));
  }
  // Belt + revolver holster
  g.add(box(BW + 0.02, 0.10, BD + 0.02, P.woodD, 0, torsoY - torsoH / 2 + 0.06, 0));
  g.add(box(0.24, 0.18, 0.04, P.gold, 0, torsoY - torsoH / 2 + 0.06, BD / 2 + 0.020));
  g.add(box(0.18, 0.28, 0.16, P.woodD,    BW / 2 + 0.10, torsoY - torsoH / 2 - 0.04, 0));
  g.add(box(0.12, 0.14, 0.10, darken(P.woodD, 0.4), BW / 2 + 0.16, torsoY - torsoH / 2 - 0.18, 0.05));
  const armW = 0.26, armH = torsoH + legH * 0.30, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.06 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.74, BD - 0.06, dusterCol, 0, (torsoY + torsoH / 2 - armH * 0.37) - shoulderY, 0));
    A.add(box(armW - 0.04, armH * 0.26, BD - 0.08, P.skinTan, 0, (torsoY + torsoH / 2 - armH * 0.87) - shoulderY, 0));
  }
  // Revolver in R hand (named so skill telegraph could highlight it)
  const revolver = new THREE.Group();
  revolver.name = 'revolver';
  revolver.position.set(0, -armH * 0.92, BD / 2 + 0.04);
  revolver.add(box(0.10, 0.12, 0.34, P.steel, 0, 0, 0));
  revolver.add(box(0.10, 0.10, 0.08, darken(P.woodD, 0.4), 0, -0.06, -0.12));
  armR.add(revolver);
  const HW = 0.54, HH = 0.58, HDP = 0.50;
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.28, 0.12, 0.26, P.skinTan, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, P.skinTan, 0, headY, 0));
  const fz = HDP / 2 + 0.01;
  // Squint eyes
  g.add(box(0.14, 0.05, 0.04, ARCH_EYE, -HW * 0.26, headY + 0.04, fz));
  g.add(box(0.14, 0.05, 0.04, ARCH_EYE,  HW * 0.26, headY + 0.04, fz));
  g.add(box(HW * 0.85, 0.05, 0.04, P.hairBrown, 0, headY - HH * 0.14, fz));
  g.add(box(0.16, 0.05, 0.05, darken(P.woodD, 0.2), 0.08, headY - HH * 0.30, fz + 0.03));
  g.add(box(0.04, 0.04, 0.04, P.red, 0.18, headY - HH * 0.30, fz + 0.05, { e: P.red, ei: 0.6 }));
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.02, 0.08, HDP + 0.02, P.hairBrown, 0, topHead - 0.02, 0));
  // Stetson — wide brim disc
  const stetson = darken(P.amber, 0.45);
  g.add(box(HW + 0.56, 0.05, HDP + 0.56, stetson, 0, topHead + 0.02, 0));
  g.add(box(HW + 0.04, 0.20, HDP + 0.04, stetson, 0, topHead + 0.15, 0));
  g.add(box(HW + 0.06, 0.04, HDP - 0.10, darken(stetson, 0.3), 0, topHead + 0.07, 0));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// GOTH — Morticia Addams; pale skin, long black skirt, flowing black hair.
// Carrier of the BLINK skill (vanishes + reappears behind player).
export function makeGoth(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 0.82, BD = 0.46, torsoH = 0.74, legH = 0.86, shoeH = 0.24;
  const lx = 0.18, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  const paleSkin = darken(P.cream, 0.08);
  const skirtY = shoeH + 0.50;
  g.add(box(BW + 0.20, 0.98, BD + 0.04, P.ironD, 0, skirtY, 0));
  g.add(box(BW + 0.22, 0.04, BD + 0.06, darken(P.ironD, 0.4), 0, skirtY - 0.49, 0));
  for (let i = -2; i <= 2; i++) g.add(box(0.04, 0.86, 0.04, darken(P.purple, 0.7), i * 0.16, skirtY, BD / 2 + 0.025));
  for (const L of [legL, legR]) {
    L.add(box(0.24, shoeH - 0.06, BD - 0.10, P.ironD, 0, (shoeH - 0.06) / 2 - hipY, 0.04));
    L.add(box(0.06, 0.10, 0.10, darken(P.ironD, 0.5), 0, shoeH - 0.16 - hipY, BD / 2 - 0.06));
    L.add(box(0.22, 0.16, BD - 0.12, paleSkin, 0, (shoeH + 0.06) - hipY, 0));
  }
  const torsoY = skirtY + 0.49 + torsoH / 2 - 0.06;
  g.add(box(BW, torsoH, BD, P.ironD, 0, torsoY, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.20, 0.04, 0.04, P.cream, 0, torsoY + torsoH * 0.32 - i * 0.16, BD / 2 + 0.02));
  for (let i = 0; i < 4; i++) g.add(box(0.02, 0.18, 0.05, P.cream, 0, torsoY + torsoH * 0.22 - i * 0.16, BD / 2 + 0.025));
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.34, 0.08, 0.30, ARCH_EYE, 0, neckY + 0.03, 0));
  g.add(box(0.06, 0.06, 0.05, P.steel, 0, neckY + 0.03, 0.16));
  // Teal cross necklace
  g.add(box(0.05, 0.24, 0.05, P.accent, 0, torsoY + torsoH / 2 - 0.08, BD / 2 + 0.040, { e: P.accent, ei: 0.55 }));
  g.add(box(0.20, 0.05, 0.05, P.accent, 0, torsoY + torsoH / 2 - 0.14, BD / 2 + 0.040, { e: P.accent, ei: 0.55 }));
  g.add(box(0.34, 0.04, 0.04, P.steel, 0, torsoY + 0.06, BD / 2 + 0.030));
  g.add(box(0.30, 0.04, 0.04, P.steel, 0, torsoY - 0.10, BD / 2 + 0.030));
  const armW = 0.20, armH = torsoH + 0.50, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.68, BD - 0.12, P.ironD,  0, (torsoY + torsoH / 2 - armH * 0.34) - shoulderY, 0));
    A.add(box(armW, armH * 0.20, BD - 0.12, paleSkin, 0, (torsoY + torsoH / 2 - armH * 0.80) - shoulderY, 0));
    A.add(box(armW + 0.14, armH * 0.34, BD - 0.06, P.ironD, 0, (torsoY + torsoH / 2 - armH * 0.92) - shoulderY, 0));
    A.add(box(armW + 0.04, 0.04, BD - 0.04, darken(P.purple, 0.7), 0, (torsoY + torsoH / 2 - armH * 1.06) - shoulderY, 0.01));
  }
  const HW = 0.50, HH = 0.58, HDP = 0.46;
  g.add(box(0.26, 0.10, 0.24, paleSkin, 0, neckY + 0.10, 0));
  const headY = neckY + 0.10 + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, paleSkin, 0, headY, 0));
  const fz = HDP / 2 + 0.01;
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE, -HW * 0.26, headY + 0.02, fz));
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE,  HW * 0.26, headY + 0.02, fz));
  g.add(box(HW * 0.92, 0.10, 0.04, ARCH_EYE, 0, headY + 0.06, fz));
  g.add(box(0.18, 0.05, 0.04, darken(P.purple, 0.5), 0, headY - HH * 0.30, fz));
  const hair = darken(P.purple, 0.95);
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.06, 0.20, HDP + 0.04, hair, 0, topHead + 0.05, 0));
  g.add(box(HW + 0.08, 0.40, 0.14, hair, 0, headY + 0.04, -HDP * 0.55));
  g.add(box(0.18, 1.10, HDP * 0.78, hair, -(HW / 2 + 0.05), headY - 0.56, -0.04));
  g.add(box(0.18, 1.10, HDP * 0.78, hair,  (HW / 2 + 0.05), headY - 0.56, -0.04));
  g.add(box(HW + 0.04, 0.14, 0.10, hair, 0, headY + HH * 0.30, HDP / 2 + 0.01));
  g.add(box(0.10, 0.05, 0.06, darken(P.red, 0.4), -HW * 0.3, topHead + 0.10, 0.04));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// BIKER — Fonzie/Brando Wild One greaser. Black leather + pompadour +
// cigarette. Carrier of the FLANK skill (passive perpendicular orbit).
export function makeBiker(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 1.10, BD = 0.54, torsoH = 0.82, legH = 0.92, shoeH = 0.20;
  const lx = 0.24, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.36, shoeH, BD + 0.04, P.ironD, 0, shoeH / 2 - hipY, 0.06));
    L.add(box(0.32, legH * 0.85, BD - 0.06, P.blue, 0, (shoeH + legH * 0.42) - hipY, 0));
    L.add(box(0.34, 0.10, BD - 0.02, darken(P.blue, 0.3), 0, (shoeH + 0.16) - hipY, 0.02));
    L.add(box(0.36, 0.06, BD - 0.00, darken(P.blue, 0.4), 0, (shoeH + 0.10) - hipY, 0.04));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW - 0.18, torsoH, BD - 0.04, P.cream, 0, torsoY, 0));
  g.add(box(BW, torsoH, BD, P.ironD, 0, torsoY, 0.005));
  g.add(box(0.20, torsoH - 0.10, 0.04, P.cream, 0, torsoY - 0.04, BD / 2 + 0.025));
  g.add(box(0.04, torsoH - 0.20, 0.04, P.steel, 0.10, torsoY, BD / 2 + 0.030));
  g.add(box(0.16, 0.16, 0.04, P.gold, -BW / 2 + 0.18, torsoY + 0.14, BD / 2 + 0.025));
  g.add(box(0.08, 0.04, 0.05, darken(P.gold, 0.4), -BW / 2 + 0.18, torsoY + 0.14, BD / 2 + 0.050));
  // Popped collar
  g.add(box(BW - 0.10, 0.12, 0.05, P.ironD, 0, torsoY + torsoH / 2 - 0.04, BD / 2 + 0.022));
  g.add(box(0.18, 0.18, 0.04, P.ironD, -BW / 2 + 0.22, torsoY + torsoH / 2 - 0.02, BD / 2 + 0.022));
  g.add(box(0.18, 0.18, 0.04, P.ironD,  BW / 2 - 0.22, torsoY + torsoH / 2 - 0.02, BD / 2 + 0.022));
  // Studded belt
  g.add(box(BW + 0.04, 0.10, BD + 0.02, P.ironD, 0, torsoY - torsoH / 2 + 0.05, 0));
  g.add(box(0.20, 0.14, 0.05, P.steel, 0, torsoY - torsoH / 2 + 0.05, BD / 2 + 0.022));
  for (let i = -2; i <= 2; i++) g.add(box(0.05, 0.05, 0.05, P.steel, i * 0.18, torsoY - torsoH / 2 + 0.05, BD / 2 + 0.025));
  const armW = 0.26, armH = torsoH + legH * 0.28, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.72, BD - 0.04, P.ironD, 0, (torsoY + torsoH / 2 - armH * 0.36) - shoulderY, 0));
    A.add(box(armW + 0.02, 0.05, BD - 0.02, P.cream, 0, (torsoY + torsoH / 2 - armH * 0.70) - shoulderY, 0.01));
    A.add(box(armW, armH * 0.28, BD - 0.06, P.skinTan, 0, (torsoY + torsoH / 2 - armH * 0.86) - shoulderY, 0));
  }
  const HW = 0.56, HH = 0.60, HDP = 0.50;
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.30, 0.12, 0.28, P.skinTan, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, P.skinTan, 0, headY, 0));
  const fz = HDP / 2 + 0.01;
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE, -HW * 0.26, headY + 0.02, fz));
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE,  HW * 0.26, headY + 0.02, fz));
  // Cigarette + ember
  g.add(box(0.16, 0.04, 0.04, P.cream, 0.08, headY - HH * 0.30, fz + 0.04));
  g.add(box(0.04, 0.04, 0.04, P.red, 0.16, headY - HH * 0.30, fz + 0.06, { e: P.red, ei: 0.6 }));
  // Sideburns
  g.add(box(0.06, 0.18, 0.04, P.hairDark, -HW / 2 - 0.01, headY - 0.04, HDP / 2 - 0.04));
  g.add(box(0.06, 0.18, 0.04, P.hairDark,  HW / 2 + 0.01, headY - 0.04, HDP / 2 - 0.04));
  // POMPADOUR — iconic silhouette
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.04, 0.16, HDP + 0.04, P.hairDark, 0, topHead + 0.06, 0));
  g.add(box(HW - 0.06, 0.34, 0.16, P.hairDark, 0, topHead + 0.24, HDP / 2 - 0.02));
  g.add(box(HW - 0.14, 0.16, 0.10, P.hairDark, 0, topHead + 0.40, HDP / 2 + 0.04));
  g.add(box(HW + 0.04, 0.40, 0.14, P.hairDark, 0, headY + 0.04, -HDP * 0.5));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

// FIREFIGHTER — FDNY hero. Yellow turnout coat + red helmet + diagonal
// hose coil. Carrier of the RAGE skill (speed boost + KB immune burst).
export function makeFirefighter(): RiggedGroup {
  const g = new THREE.Group() as RiggedGroup;
  const BW = 1.16, BD = 0.58, torsoH = 0.84, legH = 0.86, shoeH = 0.22;
  const lx = 0.26, hipY = shoeH + legH;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-lx, hipY, 0); legR.position.set(lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(0.42, shoeH, BD + 0.04, P.ironD, 0, shoeH / 2 - hipY, 0.06));
    L.add(box(0.36, legH, BD - 0.04, P.gold,   0, (shoeH + legH / 2) - hipY, 0));
    L.add(box(0.38, 0.06, BD - 0.02, P.cream, 0, (shoeH + legH * 0.30) - hipY, 0.02));
    L.add(box(0.38, 0.06, BD - 0.02, P.cream, 0, (shoeH + legH * 0.65) - hipY, 0.02));
  }
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, P.gold, 0, torsoY, 0));
  g.add(box(BW + 0.02, 0.07, BD + 0.02, P.cream,  0, torsoY + 0.20, 0));
  g.add(box(BW + 0.02, 0.07, BD + 0.02, P.cream,  0, torsoY - 0.16, 0));
  g.add(box(BW - 0.14, 0.16, 0.04, P.ironD, 0, torsoY + torsoH / 2 - 0.10, BD / 2 + 0.02));
  g.add(box(0.06, torsoH - 0.20, 0.04, P.ironD, 0, torsoY - 0.04, BD / 2 + 0.02));
  // FDNY stencil
  for (let i = 0; i < 4; i++) g.add(box(0.10, 0.10, 0.04, darken(P.red, 0.2), -0.24 + i * 0.16, torsoY - 0.04, BD / 2 + 0.025));
  // Flag patch
  for (let i = 0; i < 3; i++) g.add(box(0.05, 0.04, 0.05, P.red,   -BW / 2 + 0.18, torsoY + 0.18 + i * 0.04, BD / 2 + 0.030));
  for (let i = 0; i < 2; i++) g.add(box(0.05, 0.04, 0.05, P.cream, -BW / 2 + 0.18, torsoY + 0.20 + i * 0.04, BD / 2 + 0.030));
  g.add(box(0.10, 0.07, 0.05, darken(P.blue, 0.2), -BW / 2 + 0.18, torsoY + 0.28, BD / 2 + 0.030));
  // HOSE COIL — diagonal silhouette extender
  const hoseCol = darken(P.red, 0.15);
  for (let i = 0; i < 5; i++) {
    const a = -0.55 + i * 0.27;
    const yy = torsoY + i * 0.08 - 0.18;
    g.add(box(0.14, 0.10, 0.10, hoseCol, a * 0.5,  yy,  BD / 2 + 0.05));
    g.add(box(0.14, 0.10, 0.10, hoseCol, a * 0.5,  yy, -BD / 2 - 0.05));
    g.add(box(0.10, 0.10, BD + 0.16, hoseCol, a * 0.5 + 0.15, yy, 0));
  }
  g.add(box(0.12, 0.18, 0.12, P.steel, BW / 2 + 0.04, torsoY - 0.30, BD / 2 + 0.04));
  const armW = 0.28, armH = torsoH + legH * 0.24, shoulderY = torsoY + torsoH / 2;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0); armR.position.set(ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.66, BD - 0.06, P.gold,    0, (torsoY + torsoH / 2 - armH * 0.33) - shoulderY, 0));
    A.add(box(armW + 0.02, armH * 0.34, BD - 0.06, P.ironD, 0, (torsoY + torsoH / 2 - armH * 0.83) - shoulderY, 0));
    A.add(box(armW + 0.04, 0.06, BD - 0.04, P.cream, 0, (torsoY + torsoH / 2 - armH * 0.55) - shoulderY, 0.01));
  }
  const HW = 0.58, HH = 0.60, HDP = 0.52;
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.30, 0.12, 0.28, P.skinTan, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, P.skinTan, 0, headY, 0));
  const fz = HDP / 2 + 0.01;
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE, -HW * 0.26, headY + 0.02, fz));
  g.add(box(0.12, 0.12, 0.04, ARCH_EYE,  HW * 0.26, headY + 0.02, fz));
  g.add(box(0.42, 0.08, 0.05, P.hairBrown, 0, headY - HH * 0.16, fz));
  // BUNKER HELMET — bright red dome + front shield
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.12, 0.20, HDP + 0.10, P.red, 0, topHead + 0.11, 0));
  g.add(box(HW + 0.12, 0.04, HDP + 0.32, P.red, 0, topHead + 0.02, -0.10));
  g.add(box(HW - 0.02, 0.24, 0.12, P.red, 0, topHead + 0.18, HDP / 2 + 0.04));
  g.add(box(HW - 0.20, 0.10, 0.14, P.cream, 0, topHead + 0.20, HDP / 2 + 0.10));
  g.add(box(HW - 0.30, 0.06, 0.14, darken(P.blue, 0.3), 0, topHead + 0.12, HDP / 2 + 0.10));
  attachRig(g, legL, legR, armL, armR, 0);
  finish(g);
  return g;
}

/** Boss variant — picks which model + skill the boss uses on a given
 *  cycle. 'vampire' is the original; viking/mech/minotaur/punk are the
 *  cycle 2-5 elite roster; cop/cowboy/goth/biker/firefighter are the
 *  cycle 6-10 cultural archetype roster (summon/burstfire/blink/flank/
 *  rage skills). ('swat' kept for backwards compat — viking is the
 *  shield carrier in active rotation.) */
export type BossKind = 'vampire' | 'swat' | 'mech' | 'minotaur' | 'viking' | 'punk'
                     | 'cop' | 'cowboy' | 'goth' | 'biker' | 'firefighter';

// Dispatcher — Scene.tsx calls this when spawning a new monster. For
// tier='boss' it also takes an optional kind so we can pick the variant.
export function makeMonster(tier: ZombieTier, bossKind?: BossKind): ZombieGroup {
  let g: RiggedGroup;
  switch (tier) {
    case 'runner':  g = makeWerewolf(); break;
    case 'brute':   g = makeSkeleton(); break;
    case 'stalker': g = makeMummy();    break;
    case 'ghost':   g = makeGhost();    break;
    case 'boss':
      g = bossKind === 'viking'      ? makeViking()
        : bossKind === 'punk'        ? makePunk()
        : bossKind === 'swat'        ? makeSwat()        // legacy fallback
        : bossKind === 'mech'        ? makeCombatMech()
        : bossKind === 'minotaur'    ? makeMinotaur()
        : bossKind === 'cop'         ? makeCop()
        : bossKind === 'cowboy'      ? makeCowboy()
        : bossKind === 'goth'        ? makeGoth()
        : bossKind === 'biker'       ? makeBiker()
        : bossKind === 'firefighter' ? makeFirefighter()
        : makeVampire();
      break;
    default:        return makeZombie(tier);    // lurker / exploder
  }
  // Per-variant target scale — the elite roster is built bigger than
  // the vampire so the silhouette still reads as "boss" without needing
  // the m.scaleMul cycle bump (which still stacks on top).
  const targetScale =
    tier === 'runner'  ? 0.62 :
    tier === 'brute'   ? 0.78 :
    tier === 'stalker' ? 0.72 :
    tier === 'ghost'   ? 0.70 :
    tier === 'boss'    ? (
        bossKind === 'mech'        ? 1.55 :
        bossKind === 'minotaur'    ? 1.45 :
        bossKind === 'viking'      ? 1.35 :
        bossKind === 'punk'        ? 1.25 :
        bossKind === 'swat'        ? 1.30 :
        bossKind === 'firefighter' ? 1.35 :
        bossKind === 'cop'         ? 1.30 :
        bossKind === 'cowboy'      ? 1.35 :
        bossKind === 'biker'       ? 1.30 :
        bossKind === 'goth'        ? 1.30 :
                                     1.40   // vampire
      ) :
                         0.66;
  g.scale.setScalar(targetScale);
  return g as ZombieGroup;
}
