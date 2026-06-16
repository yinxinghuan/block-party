// BLOCK PARTY — top-down zombie survival on an empty city block.
// Three nights × 45s + boss. All tuning constants live here.

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

// ===== EXIT GOAL (replaces wave timer) =====
// Each night clears when the player walks into a violet exit beacon. The
// beacon spawns automatically once the per-night kill goal is met (or, on
// the boss night, when the boss is defeated).
export const EXIT_PICKUP_RADIUS = 1.8;
export const EXIT_MIN_DIST = 18.0;     // spawn at least this far from player
/** Kills needed before the exit beacon appears. Boss nights (every 3rd
 *  level) return -1 — the boss death triggers the exit instead. Endless:
 *  the curve preserves the original N1/N2 hand-tuned values exactly, then
 *  ramps for L4+ in a 2-non-boss + 1-boss cycle. */
export function getKillGoal(level: number): number {
  if (level === 1) return 25;
  if (level === 2) return 45;
  if (level % 3 === 0) return -1;  // L3, L6, L9, ... = boss
  // L4+: each cycle adds 15 to the base; second non-boss in cycle adds 20.
  // L4=40, L5=60 / L7=55, L8=75 / L10=70, L11=90 / L13=85, L14=105 …
  const cycle = Math.floor((level - 1) / 3);                 // L4-6 → 1, L7-9 → 2
  const inCycle = (level - 1) % 3;                           // 0 = first, 1 = second
  return 25 + cycle * 15 + inCycle * 20;
}

// ===== AUTO-FIRE (Vampire Survivors / Brotato model) =====
// Hero auto-locks the nearest non-fleeing monster within AIM_RANGE and fires
// every FIRE_COOLDOWN seconds. The bullet is a fast linear projectile.
export const AIM_RANGE = 14.0;
// Forward fire cone — only zombies within ±55° of body facing can be
// targeted. Body turns toward the locked target each shot, so to engage a
// zombie behind you, you must move/face that way first.
export const FIRE_ARC_HALF = (110 * Math.PI / 180) / 2;
export const FIRE_COOLDOWN = 0.32;     // seconds between shots — feels lively at ~3/s
export const BULLET_SPEED = 28;        // world units / sec
export const BULLET_TTL = 1.2;         // seconds before despawn
export const BULLET_RADIUS = 0.30;     // collision against monsters
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

// City block at night. Three reads:
//   N1  twilight asphalt — magenta + soft amber haze from a streetlamp
//   N2  deep dusk — colder blue, more zombies, neon shop signs muted
//   N3  blackout — bloody red ambient, boss enters
const PALETTE: Record<string, LevelPalette> = {
  twilight: { floor: '#23283d', fog: '#0a0d18', ambient: '#322856', hemiSky: '#46367a', hemiGround: '#101220', pillar: '#2c2e44' },
  dusk:     { floor: '#1c233a', fog: '#06080f', ambient: '#1f2c52', hemiSky: '#2e4e7a', hemiGround: '#0a1322', pillar: '#1f2a3c' },
  blackout: { floor: '#26161c', fog: '#0a0608', ambient: '#421824', hemiSky: '#542026', hemiGround: '#100810', pillar: '#3a1e22' },
};

// First-3-night hand-tuned data. L4+ are synthesized from formulas in
// computeEndlessTuning() that preserve this curve's slope. Keeping these
// exact rows means the opening 3 nights stay the player-tested feel.
const LEVELS_HARDCODED: LevelTuning[] = [
  // Night 1 — busy opening so the screen is already crowded when you draw
  // your first breath. Lower-tier mix with one stalker mixed in.
  { level: 1, name: 'Twilight', timeLimit: 45, lurkerCount: 14, stalkerCount: 1, monsterMax: 38, monsterSpeed: 0.90, monsterFleeSpeed: 0.90, monsterSpawnInterval: 0.55, stalkerSpawnRatio: 0.10, strikeTelegraph: 1.20, strikeRangeMax: 1.0, strikeCooldown: 2.8, crystalInitial: 4, pillarCount: 30, pillarScaleBias: 1.0,  isBoss: false, palette: PALETTE.twilight, bgmTension: 0.40 },
  // Night 2 — stalkers take over; everything moves faster, fewer beats
  // of safety. Spawn interval cuts the trickle to nearly continuous.
  { level: 2, name: 'Dusk', timeLimit: 45, lurkerCount: 22, stalkerCount: 3, monsterMax: 56, monsterSpeed: 1.05, monsterFleeSpeed: 0.95, monsterSpawnInterval: 0.35, stalkerSpawnRatio: 0.18, strikeTelegraph: 1.05, strikeRangeMax: 1.1, strikeCooldown: 2.4, crystalInitial: 3, pillarCount: 36, pillarScaleBias: 0.95, isBoss: false, palette: PALETTE.dusk,     bgmTension: 0.65 },
  // Night 3 — boss night. Max swarm, fastest stalkers, telegraph window
  // shrinks so you can't dance through bites the way Night 1 lets you.
  { level: 3, name: 'Blackout', timeLimit: 45, lurkerCount: 28, stalkerCount: 5, monsterMax: 72, monsterSpeed: 1.22, monsterFleeSpeed: 1.05, monsterSpawnInterval: 0.22, stalkerSpawnRatio: 0.22, strikeTelegraph: 0.90, strikeRangeMax: 1.2, strikeCooldown: 2.0, crystalInitial: 2, pillarCount: 42, pillarScaleBias: 1.10, isBoss: true,  palette: PALETTE.blackout, bgmTension: 0.95 },
];

// Backwards-compat export — referenced by a couple of older sites for
// the "fell on night N · NAME" gameover line. Endless: still 3 hand-tuned
// entries here, but the actual game loop reads from getLevelTuning().
export const LEVELS = LEVELS_HARDCODED;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const PALETTE_CYCLE = [PALETTE.twilight, PALETTE.dusk, PALETTE.blackout];
const NAME_CYCLE    = ['Twilight',       'Dusk',       'Blackout'];

// Endless extrapolation for level 4+. Each 3-level cycle re-tints to
// twilight → dusk → blackout while the difficulty knobs continue to
// climb (capped so the late game is "max-difficulty arcade survival"
// rather than impossible math). Boss spawns every 3rd level.
function computeEndlessTuning(level: number): LevelTuning {
  const idx = (level - 1) % 3;
  const palette = PALETTE_CYCLE[idx];
  const name = NAME_CYCLE[idx];
  const isBoss = level % 3 === 0;
  const k = level - 1;  // 0-based ramp parameter

  return {
    level,
    name,
    timeLimit: 45,  // informational; clear condition is the exit beacon, not the timer
    lurkerCount:    clamp(14 + k * 3, 14, 50),
    stalkerCount:   clamp(1 + Math.floor(k / 2), 1, 12),
    // monsterMax with a TWO-STAGE cap. Climbs to 105 then *eases off*
    // past L20 to keep the framebuffer manageable on mobile in very
    // late endless: difficulty there is carried by HP scaling + per-hit
    // damage + AI tempo, not by stacking more bodies on top of the
    // perf budget.
    //   L1=38, L8=101, L9-L20=105, L21=98, L25=88, L31+=85 (floor).
    monsterMax:     k <= 17
      ? clamp(38 + k * 9, 38, 105)
      : clamp(105 - (k - 17) * 2, 85, 105),
    monsterSpeed:   clamp(0.90 + k * 0.08, 0.90, 1.70),
    monsterFleeSpeed: clamp(0.90 + k * 0.03, 0.90, 1.30),
    // AI tempo caps relaxed for the late-game pressure pass: the formula
    // keeps dropping these stats past their old plateau so L14+ feels
    // genuinely faster (shorter spawn trickle, snappier bite warning,
    // tighter cooldown between attacks). The on-screen monsterMax stays
    // perf-locked at 90; this just makes each individual monster more
    // aggressive without adding more bodies.
    //   monsterSpawnInterval reaches 0.07 at L9+ (was 0.12 at L8+)
    //   strikeTelegraph reaches 0.45 at L14+ (was 0.70 at L9+)
    //   strikeCooldown reaches 1.0 at L24+ (was 1.5 at L17+)
    monsterSpawnInterval: clamp(0.55 - k * 0.06, 0.07, 0.55),
    stalkerSpawnRatio:    clamp(0.10 + k * 0.025, 0.10, 0.32),
    strikeTelegraph:      clamp(1.20 - k * 0.06, 0.45, 1.20),
    strikeRangeMax:       clamp(1.0 + k * 0.03, 1.0, 1.5),
    strikeCooldown:       clamp(2.8 - k * 0.08, 1.0, 2.8),
    crystalInitial:       clamp(4 - Math.floor(k / 2), 1, 4),
    pillarCount:          clamp(30 + k * 2, 30, 60),
    pillarScaleBias:      0.95 + ((level * 0.31) % 1) * 0.20,  // 0.95-1.15 wobble per level
    isBoss,
    palette,
    bgmTension:           clamp(0.40 + k * 0.08, 0.40, 1.0),
  };
}

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
  if (safe <= LEVELS_HARDCODED.length) return LEVELS_HARDCODED[safe - 1];
  return computeEndlessTuning(safe);
}
