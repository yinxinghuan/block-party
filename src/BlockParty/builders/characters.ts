// Streamlined survivor character builder — distilled from
// _lowpoly_lab/builders/characters.js character() (simpler — Block Party
// only needs a single archetype for now, the cop). Walk animation rig is
// exposed via userData.rig the same way the zombie's is, so Scene.tsx
// can drive both with the same shamble loop.

import * as THREE from 'three';
import { P, box, darken, finish } from './prims';

const EYE = 0x241f1c;

export interface CharacterRig {
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

export interface CharacterGroup extends THREE.Group {
  userData: { rig: CharacterRig };
}

interface CharSpec {
  skin: number;
  top: number;
  sleeve: number;
  bottom: number;
  shoes: number;
  hair: number;
  hat?: number;
  collar?: number;       // e.g. cop's badge area
  belt?: number;
}

function character(s: CharSpec): CharacterGroup {
  const g = new THREE.Group() as CharacterGroup;
  const BW = 1.00, BD = 0.52;
  const HW = 0.56, HH = 0.60, HDP = 0.50;
  const shoeH = 0.18, legH = 0.92, legW = 0.34, gap = 0.10;
  const lx = legW / 2 + gap / 2;

  // Legs
  const legL = new THREE.Group(), legR = new THREE.Group();
  const hipY = shoeH + legH;
  legL.position.set(-lx, hipY, 0);
  legR.position.set( lx, hipY, 0);
  for (const L of [legL, legR]) {
    L.add(box(legW + 0.02, shoeH, BD - 0.02, s.shoes, 0, shoeH / 2 - hipY, 0.05));
    L.add(box(legW,        legH,  BD - 0.08, s.bottom, 0, (shoeH + legH / 2) - hipY, 0));
  }
  g.add(legL); g.add(legR);

  // Torso
  const torsoH = 0.80;
  const torsoY = hipY + torsoH / 2;
  g.add(box(BW, torsoH, BD, s.top, 0, torsoY, 0));
  if (s.collar) {
    // Collar accent band sits at the top of the torso — for the cop this is
    // the dark navy radio strap reading as one saturate against the muted
    // uniform.
    g.add(box(BW - 0.20, 0.16, 0.05, s.collar, 0, torsoY + torsoH / 2 - 0.09, BD / 2 + 0.01));
  }
  if (s.belt) {
    g.add(box(BW + 0.02, 0.13, BD + 0.02, s.belt, 0, torsoY - torsoH / 2 + 0.07, 0));
  }

  // Arms — shoulder pivots so the auto-fire pose can rotate the firing arm.
  const armW = 0.24, armH = torsoH + legH * 0.28;
  const ax = BW / 2 + 0.02 + armW / 2;
  const armTop = torsoY + torsoH / 2 - armH * 0.36;
  const shoulderY = torsoY + torsoH / 2;
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-ax, shoulderY, 0);
  armR.position.set( ax, shoulderY, 0);
  for (const A of [armL, armR]) {
    A.add(box(armW, armH * 0.74, BD - 0.06, s.sleeve, 0, armTop - shoulderY, 0));
    A.add(box(armW, armH * 0.26, BD - 0.06, s.skin,   0, (torsoY + torsoH / 2 - armH * 0.87) - shoulderY, 0));
  }
  g.add(armL); g.add(armR);

  // Neck + head
  const neckY = torsoY + torsoH / 2 + 0.05;
  g.add(box(0.28, 0.12, 0.26, s.skin, 0, neckY, 0));
  const headY = neckY + 0.06 + HH / 2;
  g.add(box(HW, HH, HDP, s.skin, 0, headY, 0));

  // Eyes
  const fz = HDP / 2 + 0.01;
  const eyeY = headY + 0.02;
  const eyeX = HW * 0.26;
  g.add(box(0.13, 0.14, 0.04, EYE, -eyeX, eyeY, fz));
  g.add(box(0.13, 0.14, 0.04, EYE,  eyeX, eyeY, fz));

  // Hair
  const topHead = headY + HH / 2;
  g.add(box(HW + 0.05, 0.22, HDP + 0.04, s.hair, 0, topHead + 0.07, 0));
  g.add(box(HW + 0.05, 0.42, 0.14,       s.hair, 0, headY + 0.04, -HDP * 0.5));
  g.add(box(0.13, 0.46, HDP * 0.78,      s.hair, -(HW / 2 + 0.02), headY + 0.02, -0.04));
  g.add(box(0.13, 0.46, HDP * 0.78,      s.hair,  (HW / 2 + 0.02), headY + 0.02, -0.04));

  // Cap (baseball-cap silhouette, peaked brim forward — reads as a cop hat
  // when the crown is dark navy).
  if (s.hat != null) {
    g.add(box(HW + 0.06, 0.16, HDP + 0.06, s.hat, 0, topHead + 0.06, 0));         // crown
    g.add(box(HW * 0.7,  0.06, 0.20,       s.hat, 0, topHead + 0.02, HDP / 2 + 0.08)); // brim
  }

  finish(g);
  g.userData = { rig: { legL, legR, armL, armR } };
  return g;
}

// Roster — for now just the cop. Phase 4 expands this with firefighter,
// biker, nurse, fitWoman from the lab.
const SURVIVORS = {
  cop: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0x1a2030,    // navy uniform
    sleeve: 0x1a2030,
    bottom: 0x14182a,   // darker navy slacks
    shoes:  P.ironD,
    hair:   P.hairDark,
    hat:    0x0e1424,   // peaked cap, even darker than the uniform
    collar: 0xb0c2d8,   // light radio/badge strip — the single saturate
    belt:   0x1a1014,
  }),
};

export type SurvivorId = keyof typeof SURVIVORS;

export function makeSurvivor(id: SurvivorId = 'cop'): CharacterGroup {
  const g = SURVIVORS[id]();
  g.scale.setScalar(0.65);   // bring 2.4u-tall lab figure to ~1.6u game scale
  return g;
}

// Tiny pistol prop — flat-shaded boxes only, attaches to a survivor's right
// hand. Returns a small group oriented so its barrel points along +Z (the
// player's facing direction in world space after the survivor group rotates).
export function makePistol(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x161618;
  const grip  = darken(P.hairBrown, 0.6);
  // grip
  g.add(box(0.10, 0.22, 0.10, grip, 0, 0, 0));
  // slide/body
  g.add(box(0.12, 0.10, 0.34, black, 0, 0.12, 0.10));
  // barrel
  g.add(box(0.08, 0.06, 0.10, black, 0, 0.12, 0.30));
  finish(g);
  return g;
}
