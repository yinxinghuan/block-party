// Per-class weapons — fire patterns + 3D props for each survivor archetype.
// useGameLoop reads WEAPON[survivorId] each frame to drive the burst rules;
// Player renders the matching prop in the right hand.

import * as THREE from 'three';
import { box, darken, finish, P } from './prims';
import type { SurvivorId } from './characters';

export interface WeaponSpec {
  /** Projectiles per burst. cop = 1, nurse = 3 staggered darts, biker = 5
   *  pellets in a cone. */
  count: number;
  /** Half-angle of cone in radians. 0 = no spread. Cones (biker) spread
   *  the projectiles evenly across [-spread, +spread]; bursts (nurse)
   *  add tiny random jitter inside this band so a target standing still
   *  takes all three darts. */
  spreadRad: number;
  /** Seconds between burst starts. Faster cooldowns = more raw fire rate. */
  cooldown: number;
  /** Seconds between consecutive shots inside a single burst. 0 = all
   *  shots fire on the same frame (true cone). */
  burstDelay: number;
  /** Damage per individual projectile. */
  dmgPerShot: number;
  /** Audio cue for this weapon — same SFX vocabulary as Lantern. */
  sfxKey: 'shoot';
}

export const WEAPON: Record<SurvivorId, WeaponSpec> = {
  // Reliable single-shot pistol — the baseline. ~3.1 raw dps.
  cop:   { count: 1, spreadRad: 0,    cooldown: 0.32, burstDelay: 0,    dmgPerShot: 1.0, sfxKey: 'shoot' },
  // Triple-dart burst with tiny jitter. Same target gets all 3, but
  // staggered fire so the burst takes 0.12s. ~4.5 raw dps.
  nurse: { count: 3, spreadRad: 0.05, cooldown: 0.55, burstDelay: 0.06, dmgPerShot: 0.85, sfxKey: 'shoot' },
  // Shotgun cone — 5 pellets in a ~36° spread. Devastating at close
  // range, mostly misses at long. Per-pellet dmg lower so the average
  // case stays in line with the baseline. ~4.8 raw dps if everything hits.
  biker: { count: 5, spreadRad: 0.32, cooldown: 0.62, burstDelay: 0,    dmgPerShot: 0.55, sfxKey: 'shoot' },
};

// ─── PROPS ──────────────────────────────────────────────────────────────

// Tiny pistol — flat-shaded boxes, attaches to the cop's right hand.
export function makePistol(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x161618;
  const grip  = darken(P.hairBrown, 0.6);
  g.add(box(0.10, 0.22, 0.10, grip,  0, 0,    0));    // grip
  g.add(box(0.12, 0.10, 0.34, black, 0, 0.12, 0.10)); // slide
  g.add(box(0.08, 0.06, 0.10, black, 0, 0.12, 0.30)); // barrel
  finish(g);
  return g;
}

// Nurse's syringe-gun — cream body, red cross stencil on top, long needle.
export function makeSyringeGun(): THREE.Group {
  const g = new THREE.Group();
  const body = P.cream;
  const accent = 0xe04848;
  const needle = 0xc4c4c8;
  g.add(box(0.10, 0.20, 0.10, body,   0, 0,    0));    // grip
  g.add(box(0.14, 0.14, 0.30, body,   0, 0.11, 0.10)); // body
  // Red cross on the top face of the body
  g.add(box(0.04, 0.05, 0.10, accent, 0, 0.20, 0.10));
  g.add(box(0.10, 0.05, 0.04, accent, 0, 0.20, 0.10));
  // Long thin needle barrel
  g.add(box(0.04, 0.04, 0.22, needle, 0, 0.11, 0.36));
  finish(g);
  return g;
}

// Biker's sawn-off pump shotgun — wood stock, long matte black barrel.
export function makeShotgun(): THREE.Group {
  const g = new THREE.Group();
  const wood  = 0x6b4423;
  const woodD = 0x4a2f18;
  const black = 0x161618;
  g.add(box(0.10, 0.22, 0.10, wood,  0,  0,    0));     // grip
  g.add(box(0.14, 0.12, 0.42, black, 0,  0.12, 0.20));  // pump body
  g.add(box(0.18, 0.08, 0.10, woodD, 0,  0.10, 0.30));  // pump fore-end
  g.add(box(0.08, 0.08, 0.32, black, 0,  0.14, 0.55));  // barrel
  g.add(box(0.14, 0.18, 0.20, wood,  0,  0.04, -0.12)); // stock
  finish(g);
  return g;
}

export function makeWeapon(id: SurvivorId): THREE.Group {
  switch (id) {
    case 'cop':   return makePistol();
    case 'nurse': return makeSyringeGun();
    case 'biker': return makeShotgun();
  }
}
