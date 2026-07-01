// BLOCK PARTY — top-down survival on an empty city block.
// Three nights × 45s + boss. All GAMEPLAY TUNING lives here (HP, speed, score,
// difficulty curve). All THEME (palette, night names, boss ladder) lives in the
// active cartridge — see ./cartridge. This file reads the cartridge for theme
// but owns every number that affects how hard the game is.

import { CARTRIDGE } from './cartridge';

// Map / world
export const PLAYFIELD = 60;
export const ARENA_HALF = PLAYFIELD / 2;

// Player
export const PLAYER_SPEED = 7.5;
export const PLAYER_RADIUS = 0.65;

// Zombies — the strike-* knobs are the bite telegraph kept from the cave engine
// (zombie reaches out, telegraph window, then live frame). MIN/MAX bound the
// distance band the bite is allowed to start from.
export const MONSTER_BASE_SPEED = 2.6;
export const MONSTER_FLEE_SPEED = 4.5;        // unused now (no flee), kept for type compat
export const MONSTER_FLEE_TIME = 1.5;
export const MONSTER_STRIKE_RANGE_MIN = 0.4;
export const MONSTER_STRIKE_LIVE = 0.30;
export const MONSTER_STRIKE_HIT_RADIUS = 1.0;

// XP gems — every kill drops one; collecting just adds score for now (Phase
// 3 will spend XP on perks). Single color for now; the 4-color crystal type
// is collapsed into one cosmetically-gold "xp" gem.
export type CrystalType = 'xp';
export const CRYSTAL_PICKUP_RADIUS = 1.6;
export const CRYSTAL_MAX = 60;

// Scoring
export const SCORE_GOLD = 10;     // per XP gem

// Pillars (decoration / cover / landmarks). Bumped from 14 → 28 so the
// open arena gets enough visual reference points for the player to keep
// orientation between forays.
export const PILLAR_COUNT = 28;

// Camera
export const CAMERA_POS: [number, number, number] = [0, 16, 7];
export const CAMERA_FOV = 55;

// Grace — generous opening window so the player has time to orient before
// the first dark-hand attempts a strike (which itself needs ~1.2s telegraph).
export const GRACE_PERIOD = 3.0;

const COMBAT_PROFILE = CARTRIDGE.feel?.combatProfile ?? 'survivor-shooter';

// ===== EXIT GOAL (replaces wave timer) =====
// Each level clears when the player walks into a violet exit beacon.
// Batch B refactor — EVERY level is a boss level now (one new boss kind
// unlocked per level for the first 10, multi-boss after); the beacon
// spawns when ALL bosses on the level are defeated. The non-boss kill
// goal flow is retired.
export const EXIT_PICKUP_RADIUS = 1.8;
export const EXIT_MIN_DIST = 18.0;     // spawn at least this far from player

/** Boss count per level. L1-10 = 1 boss (unlock cycle). L11+ ramps:
 *  L11=1, L12=2, L14=3, L16+=4 (capped). Multi-boss feels like "1 vs N"
 *  rather than "1 vs swarm". */
export function getBossCount(level: number): number {
  if (level <= 10) return 1;
  return Math.min(4, 1 + Math.floor((level - 10) / 2));
}

export type BossKind = 'vampire' | 'minotaur' | 'mech' | 'viking' | 'punk' | 'swat'
                     | 'cop' | 'cowboy' | 'goth' | 'biker' | 'firefighter';
export type BossBehavior = BossKind;
export type BossSkin = BossKind;
export interface BossLoadout {
  behavior: BossBehavior;
  skin: BossSkin;
  name?: string;
}
export type BossLadderEntry = BossBehavior | BossLoadout;

export function normalizeBossLoadout(entry: BossLadderEntry | undefined): BossLoadout {
  if (!entry) return { behavior: 'vampire', skin: 'vampire' };
  return typeof entry === 'string'
    ? { behavior: entry, skin: entry }
    : { behavior: entry.behavior, skin: entry.skin ?? entry.behavior, name: entry.name };
}

/** The boss unlock ladder is THEME — which themed boss fills each rung lives
 *  in the cartridge (CARTRIDGE.bossLadder). The engine owns only the SCHEDULE
 *  below: L1-N ship the rung kind alone (one new behaviour per level), L(N+1)+
 *  ship getBossCount(level) bosses rotated through the roster so two adjacent
 *  levels don't show the same combo. */
export function pickBossKinds(level: number): BossLoadout[] {
  if (level < 1) return [];
  const ladder = CARTRIDGE.bossLadder;
  if (level <= ladder.length) return [normalizeBossLoadout(ladder[level - 1])];
  const count = getBossCount(level);
  return Array.from({ length: count }, (_, i) =>
    normalizeBossLoadout(ladder[(level - ladder.length - 1 + i) % ladder.length])
  );
}

/** Kills needed before the exit beacon appears. Batch B: every level
 *  is a boss level — boss deaths trigger the exit. Always -1. */
export function getKillGoal(_level: number): number {
  return -1;
}

// ===== AUTO-FIRE (Vampire Survivors / Brotato model) =====
// Hero auto-locks the nearest non-fleeing monster within AIM_RANGE and fires
// every FIRE_COOLDOWN seconds. The bullet is a fast linear projectile.
export const AIM_RANGE = COMBAT_PROFILE === 'close-swipe' ? 6.8 : 14.0;
// Forward fire cone — only zombies within ±55° of body facing can be
// targeted. Body turns toward the locked target each shot, so to engage a
// zombie behind you, you must move/face that way first.
export const FIRE_ARC_HALF = ((COMBAT_PROFILE === 'close-swipe' ? 150 : 110) * Math.PI / 180) / 2;
export const FIRE_COOLDOWN = COMBAT_PROFILE === 'close-swipe' ? 0.24 : 0.32;
export const BULLET_SPEED = COMBAT_PROFILE === 'close-swipe' ? 22 : 28;
export const BULLET_TTL = COMBAT_PROFILE === 'close-swipe' ? 0.30 : 1.2;
export const BULLET_RADIUS = COMBAT_PROFILE === 'close-swipe' ? 0.62 : 0.30;
export const BULLET_DMG = 1;           // baseline damage per shot

// Per-tier monster HP — 7 tiers now.
export const MONSTER_HP: Record<'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss', number> = {
  lurker:   3,
  runner:   2,   // fast, fragile — dies in one or two shots
  brute:    14,  // bullet sponge — survives a long burst
  stalker:  6,   // ranged spitter
  exploder: 4,   // moderate HP, but you really don't want it close
  ghost:    5,   // phaser — ignores cover, light melee touch
  boss:     32,  // vampire
};

// Score awarded per kill, per tier.
export const SCORE_KILL: Record<'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss', number> = {
  lurker:   10,
  runner:   15,
  brute:    40,
  stalker:  25,
  exploder: 20,
  ghost:    30,
  boss:     500,
};

// Per-tier speed multiplier on top of monsterBaseSpeed.
export const MONSTER_SPEED_K: Record<'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss', number> = {
  lurker:   1.00,
  runner:   1.85,
  brute:    0.55,
  stalker:  0.92,
  exploder: 1.30,
  ghost:    1.10,
  boss:     0.70,
};

// Per-tier knockback velocity when shot — bumped ~45% from the earlier
// pass so each hit visibly THROWS the zombie backward.
export const MONSTER_KNOCKBACK_V: Record<'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss', number> = {
  lurker:   16.0,
  runner:   13.0,
  brute:     4.0,
  stalker:   9.0,
  exploder: 17.0,
  ghost:    10.0,
  boss:      2.8,
};

// Bullets-per-kill comment for posterity:
//   lurker  3 hp  → 3 shots
//   runner  2 hp  → 2 shots (but they're FAST)
//   brute  14 hp  → ~14 shots, encourages keeping distance + perks
//   stalker 6 hp  → 6 shots (rare so OK)
//   exploder 4 hp → 4 shots; race to kill before they reach you
//   boss   32 hp  → 32 shots


// ===== NIGHT TUNINGS =====
// Endless: first 3 nights are hand-tuned data; L4+ are formula-synthesized
// in computeEndlessTuning(). Boss spawns every 3rd level (L3, L6, L9, ...).
// Palette + thematic name cycle through twilight → dusk → blackout. Each
// per-stat knob clamps to a soft cap so late-game becomes "max-difficulty
// arcade survival" rather than spiraling out of bounds.

export interface LevelPalette {
  floor: string;
  fog: string;
  ambient: string;
  hemiSky: string;
  hemiGround: string;
  pillar: string;        // tint applied to street props (parked cars, dumpsters)
}

export interface LevelTuning {
  level: number;
  name: string;
  timeLimit: number;            // seconds to survive this night
  lurkerCount: number;          // initial slow shamblers
  stalkerCount: number;         // initial fast runners
  monsterMax: number;
  monsterSpeed: number;         // multiplier on MONSTER_BASE_SPEED
  monsterFleeSpeed: number;     // unused; kept for type compat
  monsterSpawnInterval: number; // seconds between additional spawns
  stalkerSpawnRatio: number;    // 0-1 — fraction of respawns that come back as stalkers
  strikeTelegraph: number;      // seconds of bite windup
  strikeRangeMax: number;
  strikeCooldown: number;
  crystalInitial: number;       // ambient XP gems on the field at start of night
  pillarCount: number;          // street props (cars / dumpsters / lamps) per night
  pillarScaleBias: number;      // scale multiplier on top of 0.75 + rand
  isBoss: boolean;
  palette: LevelPalette;
  // 0 = no eerie melody, 1 = constant; influences melody-layer cadence
  bgmTension: number;
}

// Palette + night-name cycle are THEME — they live in the active cartridge
// (CARTRIDGE.palette). The engine rotates them by (level-1) % 3 below.
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Batch B — mob count DECAYS as level rises. L1 baseline 38 mobs;
// each level drops 6 percentage points, floored at 25% (=10 mobs).
// The boss IS the level, ambient mobs are pressure not spotlight.
//   L1=38, L5=30, L10=23, L13+=10 (floor)
const MOB_BASE = 38;
function mobDecay(level: number): number {
  return Math.max(0.25, 1 - (level - 1) * 0.06);
}

// Single source of truth — every level is procedurally generated.
// Boss flag is ALWAYS true (Batch B: every level a boss). Mob density
// decays so bosses stay the spotlight. Per-monster AI/speed ramps
// independently so late levels still feel sharper.
function computeEndlessTuning(level: number): LevelTuning {
  const cycle = CARTRIDGE.palette;
  const idx = (level - 1) % cycle.length;
  const palette = cycle[idx].colors;
  const name = cycle[idx].name;
  const k = level - 1;  // 0-based ramp parameter
  const decay = mobDecay(level);
  const moodFloor = CARTRIDGE.audioMood ?? 0.4;

  return {
    level,
    name,
    timeLimit: 45,  // informational; clear condition is boss death
    lurkerCount:    Math.max(2, Math.floor(14 * decay)),
    stalkerCount:   Math.max(1, Math.floor((1 + Math.floor(k / 3)) * decay)),
    monsterMax:     Math.max(8, Math.floor(MOB_BASE * decay)),
    // 2026-06-16 v3 midpoint — partial walk-back of the curve-flatten.
    // The flatten made late game feel anemic; pull each knob halfway
    // back toward the steeper pre-flatten value.
    //   monsterSpeed   cap 1.55→1.62  (slope 0.07→0.075)
    //   strikeTelegraph floor 0.60→0.52  (slope 0.05→0.055)
    //   strikeCooldown floor 1.4→1.20  (slope 0.07→0.075)
    monsterSpeed:   clamp(0.90 + k * 0.075, 0.90, 1.62),
    monsterFleeSpeed: clamp(0.90 + k * 0.03, 0.90, 1.30),
    monsterSpawnInterval: clamp(0.55 - k * 0.04, 0.20, 0.90),
    stalkerSpawnRatio:    clamp(0.10 + k * 0.025, 0.10, 0.32),
    strikeTelegraph:      clamp(1.20 - k * 0.055, 0.52, 1.20),
    strikeRangeMax:       clamp(1.0 + k * 0.03, 1.0, 1.5),
    strikeCooldown:       clamp(2.8 - k * 0.075, 1.20, 2.8),
    crystalInitial:       clamp(4 - Math.floor(k / 2), 1, 4),
    pillarCount:          clamp(30 + k * 2, 30, 60),
    pillarScaleBias:      0.95 + ((level * 0.31) % 1) * 0.20,
    isBoss:               true,   // Batch B: every level a boss level
    palette,
    bgmTension:           clamp(moodFloor + k * 0.08, moodFloor, 1.0),
  };
}

// Backwards-compat export — historical 3-night reference for the
// "fell on night N · NAME" gameover line. With Batch B everything is
// synthesized; this stays as a small compat-shim so any external
// consumer reading LEVELS[0] still gets a sensible tuning row.
export const LEVELS = [computeEndlessTuning(1), computeEndlessTuning(2), computeEndlessTuning(3)];

// Per-night tier weights for the spawn roll. Boss never rolls here — it's
// scripted on boss nights. Stalker (spitter) stays a special threat, not
// the baseline. Endless: L1-L3 are hand-tuned, L4+ continues the ramp so
// late game is mostly high-tier (lurker floor at 12 so the swarm still
// reads as a swarm and not just elites).
export function getTierWeights(level: number): Partial<Record<'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost', number>> {
  if (level === 1) return { lurker: 70, runner: 14, brute: 10, stalker:  6, exploder: 0, ghost: 0 };
  if (level === 2) return { lurker: 48, runner: 22, brute: 12, stalker: 10, exploder: 4, ghost: 4 };
  if (level === 3) return { lurker: 34, runner: 24, brute: 13, stalker: 12, exploder: 9, ghost: 8 };
  const t = level - 3;  // 1, 2, 3, ... for L4, L5, L6, ...
  return {
    lurker:   clamp(34 - t * 3, 12, 34),
    runner:   clamp(24 + t * 1, 24, 30),
    brute:    clamp(13 + t * 1, 13, 22),
    stalker:  clamp(12 + t * 1, 12, 20),
    exploder: clamp( 9 + t * 1,  9, 18),
    ghost:    clamp( 8 + t * 1,  8, 16),
  };
}

// Periodic surge — every SURGE_PERIOD seconds we drop a burst of zombies
// from random edges on top of the constant trickle, so the pressure
// has visible "another wave just hit" peaks rather than feeling flat.
export const SURGE_PERIOD = 12.0;
export const SURGE_COUNT_BASE = 5;       // Night 1 surge size
export const SURGE_COUNT_PER_NIGHT = 2;  // +N per night (Endless: capped at 14 for L7+)

export function getLevelTuning(level: number): LevelTuning {
  const safe = Math.max(1, level | 0);
  return computeEndlessTuning(safe);
}
