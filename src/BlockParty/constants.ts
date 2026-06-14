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
export const MONSTER_STRIKE_RANGE_MIN = 1.5;
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

// ===== AUTO-FIRE (Vampire Survivors / Brotato model) =====
// Hero auto-locks the nearest non-fleeing monster within AIM_RANGE and fires
// every FIRE_COOLDOWN seconds. The bullet is a fast linear projectile.
export const AIM_RANGE = 14.0;
export const FIRE_COOLDOWN = 0.32;     // seconds between shots — feels lively at ~3/s
export const BULLET_SPEED = 28;        // world units / sec
export const BULLET_TTL = 1.2;         // seconds before despawn
export const BULLET_RADIUS = 0.30;     // collision against monsters
export const BULLET_DMG = 1;           // baseline damage per shot

// Per-tier monster HP — tuned so a lurker dies in ~3 shots, stalker ~6, boss ~30.
export const MONSTER_HP: Record<'lurker' | 'stalker' | 'boss', number> = {
  lurker: 3,
  stalker: 6,
  boss: 30,
};

// Score awarded per kill, per tier.
export const SCORE_KILL: Record<'lurker' | 'stalker' | 'boss', number> = {
  lurker: 10,
  stalker: 25,
  boss: 500,
};


// ===== NIGHT TUNINGS =====
// 3 nights, each ~45s. Night 3 ends with the boss spawning into a swarm
// already on the screen. Telegraph + reach shrink, speed climbs, spawn
// interval shortens, ambient gem trickle stays ~constant.

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
  twilight: { floor: '#181d2a', fog: '#0a0d18', ambient: '#2a2042', hemiSky: '#3a2e5a', hemiGround: '#0c0e1a', pillar: '#2c2e44' },
  dusk:     { floor: '#13182a', fog: '#06080f', ambient: '#1a2440', hemiSky: '#264268', hemiGround: '#08101c', pillar: '#1f2a3c' },
  blackout: { floor: '#1a0e10', fog: '#0a0608', ambient: '#3a1418', hemiSky: '#48181c', hemiGround: '#0c0608', pillar: '#3a1e22' },
};

export const LEVELS: LevelTuning[] = [
  { level: 1, name: 'Night 1',  timeLimit: 45, lurkerCount: 4, stalkerCount: 0, monsterMax: 12, monsterSpeed: 0.85, monsterFleeSpeed: 0.90, monsterSpawnInterval: 2.6, stalkerSpawnRatio: 0.10, strikeTelegraph: 1.25, strikeRangeMax: 5.5, strikeCooldown: 3.0, crystalInitial: 6,  pillarCount: 16, pillarScaleBias: 1.0,  isBoss: false, palette: PALETTE.twilight, bgmTension: 0.30 },
  { level: 2, name: 'Night 2',  timeLimit: 45, lurkerCount: 6, stalkerCount: 2, monsterMax: 18, monsterSpeed: 1.00, monsterFleeSpeed: 0.95, monsterSpawnInterval: 1.8, stalkerSpawnRatio: 0.35, strikeTelegraph: 1.10, strikeRangeMax: 6.0, strikeCooldown: 2.6, crystalInitial: 4,  pillarCount: 18, pillarScaleBias: 0.95, isBoss: false, palette: PALETTE.dusk,     bgmTension: 0.55 },
  { level: 3, name: 'Night 3',  timeLimit: 45, lurkerCount: 8, stalkerCount: 4, monsterMax: 24, monsterSpeed: 1.18, monsterFleeSpeed: 1.05, monsterSpawnInterval: 1.2, stalkerSpawnRatio: 0.55, strikeTelegraph: 0.95, strikeRangeMax: 6.8, strikeCooldown: 2.2, crystalInitial: 2,  pillarCount: 20, pillarScaleBias: 1.10, isBoss: true,  palette: PALETTE.blackout, bgmTension: 0.95 },
];

export function getLevelTuning(level: number): LevelTuning {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1];
}
