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
  faceTex?: THREE.Texture;  // identity games: map the player's face onto the head
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

  // Identity hero — map the player's face onto the front of the head. Added
  // after finish() so the photo material isn't overwritten. Self-lit a touch
  // (emissiveMap) so it stays recognizable in the dark city; the voxel body +
  // hair keep the house style so it reads as "me, in this world".
  if (s.faceTex) {
    const faceMat = new THREE.MeshStandardMaterial({
      map: s.faceTex,
      emissive: 0xffffff,
      emissiveMap: s.faceTex,
      emissiveIntensity: 0.5,
      roughness: 0.85,
      metalness: 0,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(HW * 1.0, HH * 0.94), faceMat);
    face.position.set(0, headY + 0.02, HDP / 2 + 0.02);
    g.add(face);
  }

  g.userData = { rig: { legL, legR, armL, armR } };
  return g;
}

// Neutral civilian body for the photo / avatar hero — a plain hoodie so the
// figure reads as "you" (your face, everyday clothes) rather than one of the
// themed archetypes. The face texture is what carries identity.
const PHOTO_HERO_SPEC: CharSpec = {
  skin:  P.skin,
  top:   0x3a6ea5, sleeve: 0x33648f, bottom: 0x26303f, shoes: 0x1a1a1e,
  hair:  P.hairBrown,
};

/** Build the identity hero: neutral low-poly body + the player's face on the
 *  head. Same rig/scale as makeSurvivor so the engine wires it identically. */
export function makeSurvivorWithFace(faceTex: THREE.Texture): CharacterGroup {
  const g = character({ ...PHOTO_HERO_SPEC, faceTex });
  g.scale.setScalar(0.65);
  return g;
}

// Roster — 8 city-night archetypes. Cop / nurse / biker are free starters;
// the other 5 unlock at the store for $30 of accumulated score. Same
// character() shell, distinct color choices so silhouettes read at a
// glance even at thumbnail size.
const SURVIVORS = {
  cop: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0x1a2030, sleeve: 0x1a2030, bottom: 0x14182a, shoes: P.ironD,
    hair:  P.hairDark, hat: 0x0e1424,
    collar: 0xb0c2d8, belt: 0x1a1014,
  }),
  nurse: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0xe8eef0, sleeve: 0xe8eef0, bottom: 0xd0d8da, shoes: 0xf0f0f0,
    hair:  P.hairBrown, hat: 0xf6f8fa,
    collar: 0xe04848, belt: 0xc8d0d2,
  }),
  biker: (): CharacterGroup => character({
    skin:  P.skinTan,
    top:   0x161618, sleeve: 0x202024, bottom: 0x2a2832, shoes: 0x0a0a0c,
    hair:  P.hairDark, hat: 0x111114,
    collar: 0xb84030, belt: 0x383838,
  }),
  // Locked starters ↓ — earned at the store.
  firefighter: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0xd87420, sleeve: 0xd87420, bottom: 0x2a1c14, shoes: 0x0c0c10,
    hair:  P.hairDark, hat: 0xb43020,
    collar: 0xfff0a0,   // reflective stripe accent
    belt:   0x1a1410,
  }),
  paramedic: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0x1f6d3a, sleeve: 0x1f6d3a, bottom: 0x12351f, shoes: 0x101012,
    hair:  P.hairBrown, hat: 0xf0f0f0,
    collar: 0xfff5f5,
    belt:   0x0e2014,
  }),
  chef: (): CharacterGroup => character({
    skin:  P.skin,
    top:   0xefe8d8, sleeve: 0xefe8d8, bottom: 0x202024, shoes: 0x0e0e12,
    hair:  P.hairBrown, hat: 0xfff8e8,   // tall cap (color shape)
    collar: 0xc23030,
    belt:   0x303034,
  }),
  worker: (): CharacterGroup => character({
    skin:  P.skinTan,
    top:   0xf2c14e, sleeve: 0xc8a544, bottom: 0x2c3548, shoes: 0x402a1c,
    hair:  P.hairDark, hat: 0xfff080,
    collar: 0xfff080,
    belt:   0x3a2a18,
  }),
  goth: (): CharacterGroup => character({
    skin:  0xc8b6a8,
    top:   0x0c0c10, sleeve: 0x141418, bottom: 0x14121a, shoes: 0x0a0a0c,
    hair:  0x14121e, hat: 0x0a0a10,
    collar: 0x9540d8,
    belt:   0x32183a,
  }),
};

export type SurvivorId = keyof typeof SURVIVORS;

export const SURVIVOR_IDS: SurvivorId[] = Object.keys(SURVIVORS) as SurvivorId[];

// Free at the start — others unlock by spending score at the store.
export const STARTER_SURVIVORS: SurvivorId[] = ['cop', 'nurse', 'biker'];

// Cost in score-credits to unlock a locked archetype.
export const SURVIVOR_UNLOCK_PRICE = 200;

// Display metadata used by the splash + store. Same swatch colors as
// each archetype's main garment.
export const SURVIVOR_META: Record<SurvivorId, { label: string; tint: string }> = {
  cop:         { label: 'COP',         tint: '#3a5586' },
  nurse:       { label: 'NURSE',       tint: '#e8a4a4' },
  biker:       { label: 'BIKER',       tint: '#2a2a30' },
  firefighter: { label: 'FIREFIGHTER', tint: '#d87420' },
  paramedic:   { label: 'PARAMEDIC',   tint: '#48b06a' },
  chef:        { label: 'CHEF',        tint: '#efe8d8' },
  worker:      { label: 'WORKER',      tint: '#f2c14e' },
  goth:        { label: 'GOTH',        tint: '#9540d8' },
};

export function makeSurvivor(id: SurvivorId = 'cop'): CharacterGroup {
  const g = SURVIVORS[id]();
  g.scale.setScalar(0.65);   // bring 2.4u-tall lab figure to ~1.6u game scale
  return g;
}

/** Low-poly cat hero for cartridge themes where the player should clearly be
 *  an animal rather than a human survivor. It keeps the same rig keys so the
 *  engine walk loop can animate it without learning a new skeleton. */
export function makeCatHero(tint: string | number = '#c8a050'): CharacterGroup {
  const color = typeof tint === 'string'
    ? new THREE.Color(tint).getHex()
    : tint;
  const dark = darken(color, 0.35);
  const light = darken(color, -0.18);
  const nose = 0xff9ab8;

  const g = new THREE.Group() as CharacterGroup;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const armL = new THREE.Group();
  const armR = new THREE.Group();

  // Body is long on Z so the silhouette reads as a cat from the top camera.
  g.add(box(0.72, 0.36, 1.12, color, 0, 0.62, -0.04));
  g.add(box(0.50, 0.42, 0.46, color, 0, 0.72, 0.62));

  // Ears, snout, eyes.
  g.add(box(0.16, 0.26, 0.14, dark, -0.20, 1.02, 0.62));
  g.add(box(0.16, 0.26, 0.14, dark,  0.20, 1.02, 0.62));
  g.add(box(0.28, 0.16, 0.16, light, 0, 0.67, 0.86));
  g.add(box(0.08, 0.06, 0.04, nose, 0, 0.70, 0.95, { e: nose, ei: 0.5 }));
  g.add(box(0.07, 0.08, 0.04, EYE, -0.13, 0.80, 0.86));
  g.add(box(0.07, 0.08, 0.04, EYE,  0.13, 0.80, 0.86));

  // Tail curling upward behind the body.
  g.add(box(0.16, 0.16, 0.56, color, 0, 0.76, -0.78));
  g.add(box(0.14, 0.44, 0.14, color, 0, 1.02, -1.00));
  g.add(box(0.20, 0.14, 0.14, color, 0.10, 1.28, -0.98));

  const paw = (group: THREE.Group, x: number, z: number) => {
    group.position.set(x, 0.42, z);
    group.add(box(0.18, 0.42, 0.18, dark, 0, -0.18, 0));
    group.add(box(0.22, 0.08, 0.24, light, 0, -0.43, 0.03));
    g.add(group);
  };
  paw(armL, -0.30, 0.34);
  paw(armR,  0.30, 0.34);
  paw(legL, -0.28, -0.48);
  paw(legR,  0.28, -0.48);

  finish(g);
  g.userData = { rig: { legL, legR, armL, armR } };
  g.scale.setScalar(0.86);
  return g;
}

// Maglite-style flashlight prop — short stubby barrel + a hot emissive lens
// at the tip. Lives in the survivor's left hand and points along +Z so a
// SpotLight attached at the lens position throws its cone forward.
export function makeFlashlight(): THREE.Group {
  const g = new THREE.Group();
  const body = darken(P.steel, 0.45);
  const rim = darken(P.steel, 0.30);
  // grip (rear)
  g.add(box(0.10, 0.10, 0.16, body, 0, 0, -0.04));
  // barrel
  g.add(box(0.11, 0.11, 0.20, body, 0, 0, 0.08));
  // head ring (slightly larger so the silhouette reads as a torch)
  g.add(box(0.16, 0.13, 0.07, rim, 0, 0, 0.20));
  // lit lens — bright warm-white emissive at the tip
  g.add(box(0.12, 0.10, 0.03, 0xfff0c8, 0, 0, 0.25, { e: 0xffd070, ei: 3.4 }));
  finish(g);
  return g;
}
