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
  userData: { rig: ZombieRig; armBase: number };
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

// Dispatcher — Scene.tsx calls this when spawning a new monster.
export function makeMonster(tier: ZombieTier): ZombieGroup {
  let g: RiggedGroup;
  switch (tier) {
    case 'runner':  g = makeWerewolf(); break;
    case 'brute':   g = makeSkeleton(); break;
    case 'stalker': g = makeMummy();    break;
    case 'ghost':   g = makeGhost();    break;
    case 'boss':    g = makeVampire();  break;
    default:        return makeZombie(tier);    // lurker / exploder
  }
  const targetScale =
    tier === 'runner'  ? 0.62 :
    tier === 'brute'   ? 0.78 :
    tier === 'stalker' ? 0.72 :
    tier === 'ghost'   ? 0.70 :
    tier === 'boss'    ? 1.40 :
                         0.66;
  g.scale.setScalar(targetScale);
  return g as ZombieGroup;
}
