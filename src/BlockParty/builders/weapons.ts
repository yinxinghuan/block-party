// Global weapon catalog — every survivor starts with a PISTOL and swaps
// to any weapon they walk over. Per-archetype starter weapons are gone:
// you find your firepower on the street.

import * as THREE from 'three';
import { box, darken, finish, P } from './prims';

export type WeaponId = 'pistol' | 'shotgun' | 'smg' | 'syringe' | 'magnum';

export interface WeaponSpec {
  /** Projectiles per burst. cop pistol = 1, shotgun = 5 pellets in a cone,
   *  syringe = 3-dart burst, etc. */
  count: number;
  /** Half-angle of cone (radians). 0 = no spread. Cones spread evenly,
   *  bursts add tiny random jitter inside the band. */
  spreadRad: number;
  /** Seconds between burst starts. Smaller = faster. */
  cooldown: number;
  /** Seconds between consecutive shots inside a burst (0 = all fire at
   *  once like a cone). */
  burstDelay: number;
  /** Damage per individual projectile. */
  dmgPerShot: number;
  /** Bullet world-velocity multiplier (1.0 = baseline). Shotgun pellets
   *  fly fast; magnum slugs are heavy. */
  speedMul: number;
  label: string;
  /** Halo + accent color for pickups + the HUD chip. */
  tint: string;
}

// 2026-06-16 baseline DPS bump (~20% per weapon) — user feedback "难度大".
// All values are the LEVEL-1 base; lvl-up still compounds via 1.12^(lvl-1).
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  // Baseline pistol — every run starts here. Reliable, medium dps.
  pistol:  { count: 1, spreadRad: 0,    cooldown: 0.30, burstDelay: 0,    dmgPerShot: 1.25, speedMul: 1.0, label: 'PISTOL',  tint: '#ffd060' },
  // Close-range crowd cleaner. Massive close DPS, falls off at distance.
  shotgun: { count: 5, spreadRad: 0.32, cooldown: 0.58, burstDelay: 0,    dmgPerShot: 0.72, speedMul: 1.05, label: 'SHOTGUN', tint: '#ff7050' },
  // High fire-rate spray — single bullet but quick cooldown. Weak per
  // shot, so it leans on volume + pierce/crit perks.
  smg:     { count: 1, spreadRad: 0.04, cooldown: 0.13, burstDelay: 0,    dmgPerShot: 0.55, speedMul: 1.10, label: 'SMG',     tint: '#7eccff' },
  // Nurse's old burst, repurposed as a pickup. 3 darts staggered over
  // 0.12s with a tiny jitter so a stationary target eats all three.
  syringe: { count: 3, spreadRad: 0.05, cooldown: 0.50, burstDelay: 0.06, dmgPerShot: 1.0,  speedMul: 1.0,  label: 'SYRINGE', tint: '#7fffa8' },
  // High-damage slow revolver. One-shots lurkers + stalkers (with crit).
  magnum:  { count: 1, spreadRad: 0,    cooldown: 0.80, burstDelay: 0,    dmgPerShot: 4.2,  speedMul: 1.25, label: 'MAGNUM',  tint: '#cf8aff' },
};

/** Pool of weapons that can drop on the street. Pistol is the baseline
 *  starter so it doesn't drop. */
export const DROPPABLE_WEAPONS: WeaponId[] = ['shotgun', 'smg', 'syringe', 'magnum'];

/** Max level a weapon can reach via re-pickups. */
export const WEAPON_LEVEL_MAX = 5;

/** Compute the effective WeaponSpec at a given level. Same-weapon
 *  pickups call this so each level applies the same curve:
 *    cooldown × 0.90^(lvl-1)         → -10% CD per level
 *    dmgPerShot × 1.12^(lvl-1)       → +12% dmg per level
 *    count + 1 at level 3 and again at level 5
 *  Pistol stays a baseline spec — it never drops, never levels. */
export function weaponEffectiveSpec(id: WeaponId, level: number): WeaponSpec {
  const base = WEAPONS[id];
  const lvl = Math.max(1, Math.min(WEAPON_LEVEL_MAX, level));
  const n = lvl - 1;
  return {
    ...base,
    cooldown: base.cooldown * Math.pow(0.90, n),
    dmgPerShot: base.dmgPerShot * Math.pow(1.12, n),
    count: base.count + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0),
  };
}

// ─── PROPS ──────────────────────────────────────────────────────────────

export function makePistol(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x161618;
  const grip  = darken(P.hairBrown, 0.6);
  g.add(box(0.10, 0.22, 0.10, grip,  0, 0,    0));
  g.add(box(0.12, 0.10, 0.34, black, 0, 0.12, 0.10));
  g.add(box(0.08, 0.06, 0.10, black, 0, 0.12, 0.30));
  finish(g);
  return g;
}

export function makeSyringeGun(): THREE.Group {
  const g = new THREE.Group();
  const body = P.cream;
  const accent = 0xe04848;
  const needle = 0xc4c4c8;
  g.add(box(0.10, 0.20, 0.10, body,   0, 0,    0));
  g.add(box(0.14, 0.14, 0.30, body,   0, 0.11, 0.10));
  g.add(box(0.04, 0.05, 0.10, accent, 0, 0.20, 0.10));
  g.add(box(0.10, 0.05, 0.04, accent, 0, 0.20, 0.10));
  g.add(box(0.04, 0.04, 0.22, needle, 0, 0.11, 0.36));
  finish(g);
  return g;
}

export function makeShotgun(): THREE.Group {
  const g = new THREE.Group();
  const wood  = 0x6b4423;
  const woodD = 0x4a2f18;
  const black = 0x161618;
  g.add(box(0.10, 0.22, 0.10, wood,  0,  0,    0));
  g.add(box(0.14, 0.12, 0.42, black, 0,  0.12, 0.20));
  g.add(box(0.18, 0.08, 0.10, woodD, 0,  0.10, 0.30));
  g.add(box(0.08, 0.08, 0.32, black, 0,  0.14, 0.55));
  g.add(box(0.14, 0.18, 0.20, wood,  0,  0.04, -0.12));
  finish(g);
  return g;
}

// SMG — short stubby barrel + box magazine sticking down.
export function makeSMG(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x161618;
  const grey  = 0x4a4a52;
  g.add(box(0.10, 0.18, 0.10, black, 0,  0,    0));        // grip
  g.add(box(0.14, 0.14, 0.38, black, 0,  0.13, 0.12));     // receiver
  g.add(box(0.10, 0.20, 0.10, grey,  0,  -0.10, 0.06));    // mag below grip
  g.add(box(0.06, 0.06, 0.18, black, 0,  0.14, 0.36));     // short barrel
  g.add(box(0.04, 0.04, 0.06, 0xff8030, 0, 0.14, 0.48, { e: 0xff7030, ei: 2.2 })); // tracer hot tip
  finish(g);
  return g;
}

// Magnum revolver — chunky cylinder + long heavy barrel + wood grip.
export function makeMagnum(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x121214;
  const steel = 0x6c6c74;
  const wood  = 0x553319;
  g.add(box(0.10, 0.22, 0.10, wood,  0,  0,    0));         // grip
  g.add(box(0.14, 0.16, 0.18, steel, 0,  0.12, 0.06));      // frame
  g.add(box(0.16, 0.18, 0.18, steel, 0,  0.12, 0.16));      // cylinder bulge
  g.add(box(0.10, 0.10, 0.40, black, 0,  0.13, 0.40));      // long barrel
  finish(g);
  return g;
}

export function makeWeapon(id: WeaponId): THREE.Group {
  switch (id) {
    case 'pistol':  return makePistol();
    case 'shotgun': return makeShotgun();
    case 'smg':     return makeSMG();
    case 'syringe': return makeSyringeGun();
    case 'magnum':  return makeMagnum();
  }
}
