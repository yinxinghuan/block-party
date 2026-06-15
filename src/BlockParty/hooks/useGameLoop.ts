import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PLAYFIELD, ARENA_HALF, PLAYER_SPEED, PLAYER_RADIUS,
  MONSTER_BASE_SPEED,
  MONSTER_STRIKE_RANGE_MIN, MONSTER_STRIKE_LIVE,
  MONSTER_STRIKE_HIT_RADIUS,
  CRYSTAL_PICKUP_RADIUS, CRYSTAL_MAX,
  SCORE_GOLD,
  GRACE_PERIOD,
  getLevelTuning,
  AIM_RANGE, FIRE_ARC_HALF, BULLET_SPEED, BULLET_TTL, BULLET_RADIUS,
  SURGE_PERIOD, SURGE_COUNT_BASE, SURGE_COUNT_PER_NIGHT,
  MONSTER_SPEED_K, MONSTER_KNOCKBACK_V, getTierWeights,
  EXIT_PICKUP_RADIUS, EXIT_MIN_DIST, getKillGoal,
  MONSTER_HP, SCORE_KILL,
} from '../constants';
import type { CrystalType, LevelTuning } from '../constants';
import type { BloodSplat, Bullet, Crystal, EnemyProjectile, ExitStone, FxEvent, Monster, MonsterTier, PerkDrop, Pillar, PillarVariant, Stick } from '../types';
import { getPerk, rollOnePerk } from '../perks';
import { DROPPABLE_WEAPONS, weaponEffectiveSpec, WEAPON_LEVEL_MAX } from '../builders/weapons';
import type { WeaponId } from '../builders/weapons';
import type { SurvivorId } from '../builders/characters';

const WEAPON_DROP_INTERVAL = 25;     // seconds between drops
const WEAPON_DROP_LIFE = 22;         // a drop fades out after this long
const WEAPON_PICKUP_RADIUS = 1.6;

const CRYSTAL_RESPAWN_INTERVAL = 2.5;     // every 2.5s drop a fresh ambient XP gem

export type SfxKey = 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse' | 'monster_flee' | 'game_over' | 'shoot' | 'kill';

export interface GameRef {
  pos: THREE.Vector3;
  rot: number;
  speed: number;
  monsters: Monster[];
  crystals: Crystal[];     // XP gems (the "walls" / blue crystal mechanic is gone)
  pillars: Pillar[];       // street obstacles (cars / dumpsters in later phase)
  bullets: Bullet[];       // hero's auto-fired projectiles
  fireCooldown: number;    // counts down; <=0 means ready to fire the next burst
  kills: number;           // monsters killed this run — drives score with SCORE_KILL
  muzzleFlashT: number;    // 0..0.07 fade window after each shot
  hp: number;              // hearts remaining (max 3)
  maxHp: number;
  iframesT: number;        // invulnerability window after a bite (sec)
  /** Bearing of the current auto-fire target relative to body facing
   *  (radians, in the ±55° = ±0.96rad fire arc). null when no target is
   *  in arc — the right arm relaxes to low-ready in that case. */
  aimYaw: number | null;
  /** Pending shots inside a burst — nurse triple-tap stages 3 darts at
   *  60ms intervals; cop + biker enqueue everything on the same frame. */
  pendingShots: { fireAt: number; dirX: number; dirZ: number; dmg: number }[];
  /** Exit beacon for the current night. Null until killsThisNight reaches
   *  the per-night goal (or boss dies on night 3); once summoned, the
   *  player walks into it to clear the night. */
  exit: ExitStone | null;
  /** Kill count toward the current night's exit goal. Resets each level. */
  killsThisNight: number;
  /** Set true the frame the exit spawns — UI plays an "EXIT OPEN" toast. */
  exitJustOpened: boolean;
  /** Active weapon — starts as 'pistol', changes when the player walks
   *  over a WeaponDrop. Player component watches this to swap the prop. */
  currentWeaponId: WeaponId;
  /** 1..WEAPON_LEVEL_MAX. Same-weapon re-pickup increments by 1 (cap at
   *  max); a different weapon resets to 1. */
  currentWeaponLevel: number;
  // Latest pickup metadata for the HUD toast. `kind` distinguishes a swap
  // from a level-up so the chip can render the right message.
  lastWeaponPickupKind: 'swap' | 'levelup' | null;
  lastWeaponPickupAt: number;
  weaponDrops: { id: number; position: THREE.Vector3; weaponId: WeaponId; bornAt: number }[];
  weaponDropTimer: number;
  bloodSplats: BloodSplat[];
  /** Camera shake — decays from 1 over the next `cameraShakeT` seconds.
   *  Bullet hits bump it small (0.08s), player damage bumps it heavy
   *  (0.30s), boss kill bumps it huge (0.55s). */
  cameraShakeT: number;
  cameraShakeMag: number;

  // ─── perk stats (Phase 5) ──────────────────────────────────────────
  // Multipliers/adders applied on top of the survivor's base weapon spec.
  // All defaults are the identity so an unbuilt run plays at baseline.
  xp: number;              // total XP gems collected (display only)
  xpInLevel: number;       // gems collected toward the next perk drop
  xpNeededForLevel: number;// gems needed to trigger the next perk drop
  xpLevel: number;         // perk-drops earned so far
  perkDrops: PerkDrop[];   // power-ups on the street awaiting pickup
  enemyProjectiles: EnemyProjectile[];   // spit globs from ranged stalkers
  // Latest perk auto-applied — drives the HUD toast. id + applyAt let the
  // UI fade the toast out after a couple of seconds.
  lastAppliedPerkId: string | null;
  lastAppliedPerkAt: number;
  perkFireRateMul: number; // <1 = faster fire (cooldown × this)
  perkDmgMul: number;      // bullet damage × this
  perkExtraProjectiles: number; // adds N projectiles per burst
  perkPierce: number;      // bullets pass through N enemies before despawn
  perkCritChance: number;  // 0..1 chance per shot of 2× dmg
  perkMagnetMul: number;   // XP gem auto-pull radius multiplier
  perkSpeedMul: number;    // player movement × this
  perkKillHealChance: number; // 0..1 chance per kill to restore 1 HP
  time: number;            // total game time (across nights) — used for cooldowns
  levelT: number;          // time elapsed within the current night
  score: number;
  goldCount: number;       // XP gems picked up
  monsterSpawnTimer: number;
  surgeTimer: number;                  // counts toward the next surge burst
  crystalRespawnTimer: number;
  nearestMonsterDist: number;
  fx: FxEvent[];
  initialized: boolean;
  gameOver: boolean;
  // Night progression (named "level" to keep the existing UI plumbing happy)
  level: number;           // 1-indexed
  levelCleared: boolean;   // set when the wave timer runs out; UI handles transition
  victory: boolean;        // true after the final night cleared
}

export function createGameState(): GameRef {
  return {
    pos: new THREE.Vector3(0, 0, 5),
    rot: Math.PI,
    speed: 0,
    monsters: [],
    crystals: [],
    pillars: [],
    bullets: [],
    fireCooldown: 0,
    kills: 0,
    muzzleFlashT: 0,
    hp: 3,
    maxHp: 3,
    iframesT: 0,
    aimYaw: null,
    pendingShots: [],
    exit: null,
    killsThisNight: 0,
    exitJustOpened: false,
    currentWeaponId: 'pistol',
    currentWeaponLevel: 1,
    lastWeaponPickupKind: null,
    lastWeaponPickupAt: 0,
    weaponDrops: [],
    weaponDropTimer: WEAPON_DROP_INTERVAL * 0.3, // first drop ~7s in
    bloodSplats: [],
    cameraShakeT: 0,
    cameraShakeMag: 0,
    xp: 0,
    xpInLevel: 0,
    xpNeededForLevel: 5,
    xpLevel: 0,
    perkDrops: [],
    enemyProjectiles: [],
    lastAppliedPerkId: null,
    lastAppliedPerkAt: 0,
    perkFireRateMul: 1,
    perkDmgMul: 1,
    perkExtraProjectiles: 0,
    perkPierce: 0,
    perkCritChance: 0,
    perkMagnetMul: 1,
    perkSpeedMul: 1,
    perkKillHealChance: 0,
    time: 0,
    levelT: 0,
    score: 0,
    goldCount: 0,
    monsterSpawnTimer: 0,
    surgeTimer: 0,
    crystalRespawnTimer: 0,
    nearestMonsterDist: 99,
    fx: [],
    initialized: false,
    gameOver: false,
    level: 1,
    levelCleared: false,
    victory: false,
  };
}

let idCounter = 1;
const nextId = () => idCounter++;

function emitFx(d: GameRef, type: FxEvent['type'], x: number, z: number) {
  d.fx.push({ key: Math.random(), type, x, z, born: d.time });
  if (d.fx.length > 40) d.fx = d.fx.filter(f => d.time - f.born < 2.5);
}

// Spawn N blood splats at world (x, z) — each gets a randomized outward
// velocity + a few-bone-fragment chance. The pool is capped so a long
// run doesn't stack 1000 splats. `dirX/dirZ` optionally biases the spray
// (e.g. along the bullet direction) so blood SHOOTS out instead of just
// puddling around.
const BLOOD_SPLAT_MAX = 220;
function spawnBloodSplats(
  d: GameRef,
  x: number, z: number,
  count: number,
  intensity = 1,
  dirX = 0, dirZ = 0,
) {
  const hasDir = (dirX !== 0 || dirZ !== 0);
  const dirAngle = hasDir ? Math.atan2(dirX, dirZ) : 0;
  for (let i = 0; i < count; i++) {
    // Bias splay along dirAngle if set; otherwise full 360° burst.
    const angle = hasDir
      ? dirAngle + (Math.random() - 0.5) * Math.PI * 0.85    // ~150° cone forward
      : Math.random() * Math.PI * 2;
    const baseSpeed = 5 + Math.random() * 7 * intensity;
    const lateral = 0.55 + Math.random() * 0.65;
    const isBone = Math.random() < 0.20;
    d.bloodSplats.push({
      id: nextId(),
      position: new THREE.Vector3(x, 0.85 + Math.random() * 0.6, z),
      velocity: new THREE.Vector3(
        Math.sin(angle) * baseSpeed * lateral,
        4 + Math.random() * 4 * intensity,                   // higher arc
        Math.cos(angle) * baseSpeed * lateral,
      ),
      bornAt: d.time,
      life: 1.0 + Math.random() * 0.8,
      scale: 0.08 + Math.random() * (isBone ? 0.10 : 0.16) * intensity,
      isBone,
    });
  }
  if (d.bloodSplats.length > BLOOD_SPLAT_MAX) {
    d.bloodSplats.splice(0, d.bloodSplats.length - BLOOD_SPLAT_MAX);
  }
}

function shakeCamera(d: GameRef, mag: number, dur: number) {
  if (mag > d.cameraShakeMag) {
    d.cameraShakeMag = mag;
    d.cameraShakeT = dur;
  } else {
    d.cameraShakeT = Math.max(d.cameraShakeT, dur);
  }
}

function randomSpawnPos(d: GameRef, minDistFromPlayer: number, marginFromEdge: number): THREE.Vector3 {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * (PLAYFIELD - marginFromEdge * 2);
    const z = (Math.random() - 0.5) * (PLAYFIELD - marginFromEdge * 2);
    const dx = x - d.pos.x;
    const dz = z - d.pos.z;
    if (dx * dx + dz * dz >= minDistFromPlayer * minDistFromPlayer) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return new THREE.Vector3((Math.random() - 0.5) * PLAYFIELD * 0.8, 0, (Math.random() - 0.5) * PLAYFIELD * 0.8);
}

function spawnMonsterTier(d: GameRef, tuning: LevelTuning, tier: MonsterTier) {
  if (d.monsters.length >= tuning.monsterMax) return;
  const minDist = tier === 'boss' ? 18 : 14;
  const pos = randomSpawnPos(d, minDist, 2);
  // Endless boss scaling — each 3-level cycle past the first adds +50%
  // HP to the boss. Cycle 1 (L3) = 32 hp, cycle 2 (L6) = 48, cycle 3
  // (L9) = 64, cycle 4 (L12) = 80, … capped at 5x baseline (160).
  let hp = MONSTER_HP[tier];
  if (tier === 'boss') {
    const cycle = Math.max(1, Math.floor(tuning.level / 3));
    hp = Math.min(MONSTER_HP.boss * 5, Math.round(MONSTER_HP.boss * (1 + (cycle - 1) * 0.5)));
  }
  d.monsters.push({
    id: nextId(),
    position: pos,
    velocity: new THREE.Vector3(),
    rotation: Math.random() * Math.PI * 2,
    state: 'lurking',
    fleeT: 0,
    cooldownT: 0,
    strikeT: 0,
    strikeAimX: 0,
    strikeAimZ: 0,
    tier,
    hp,
    maxHp: hp,
    hitFlashT: 0,
    knockbackVX: 0,
    knockbackVZ: 0,
    knockbackT: 0,
    dying: false,
    dyingT: 0,
    flightVX: 0,
    flightVZ: 0,
    flightSpin: 0,
    deathStyle: 0,
    deathArc: 0,
    isBoss: tier === 'boss',
  });
}

// Per-tier launch impulse when killed — bumped 33% so corpses really
// SAIL across the asphalt instead of slumping forward.
const LAUNCH_SPEED: Record<MonsterTier, number> = {
  lurker:   24.0,
  runner:   22.0,
  brute:    10.0,
  stalker:  20.0,
  exploder: 22.0,
  ghost:     0.0,
  boss:      6.0,
};

// Damage a flying corpse deals when it body-checks another live monster.
const CORPSE_HIT_DMG: Record<MonsterTier, number> = {
  lurker:   2,
  runner:   2,
  brute:    4,
  stalker:  3,
  exploder: 3,
  ghost:    0,
  boss:     0,
};

// Weighted tier roll for the per-night spawn distribution. Boss is never
// rolled here — it's scripted at the start of night 3. Falls back to
// lurker if the weights table is empty for some reason.
function rollSpawnTier(level: number): Exclude<MonsterTier, 'boss'> {
  const weights = getTierWeights(level);
  let total = 0;
  for (const v of Object.values(weights)) total += v ?? 0;
  if (total <= 0) return 'lurker';
  const r = Math.random() * total;
  let acc = 0;
  for (const [tier, w] of Object.entries(weights)) {
    acc += w ?? 0;
    if (r < acc) return tier as Exclude<MonsterTier, 'boss'>;
  }
  return 'lurker';
}

// Pick an EXIT spawn position: far from the player, away from edges.
// Falls through to the opposite-of-player position if it can't find a
// clean spot in 30 tries.
function pickExitSpawn(d: GameRef): THREE.Vector3 {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * (PLAYFIELD - 6);
    const z = (Math.random() - 0.5) * (PLAYFIELD - 6);
    if (Math.hypot(x - d.pos.x, z - d.pos.z) >= EXIT_MIN_DIST) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return new THREE.Vector3(-d.pos.x * 0.8, 0, -d.pos.z * 0.8);
}

function summonExit(d: GameRef, atPos?: THREE.Vector3) {
  if (d.exit) return;
  d.exit = {
    position: atPos ? atPos.clone() : pickExitSpawn(d),
    bornAt: d.time,
  };
  d.exitJustOpened = true;
}

// Called after every kill credit. Boss death always opens the exit at
// the boss's position. Otherwise, the night-1/2 kill goal opens it at a
// random far-distance spot.
function checkExitTrigger(d: GameRef, killedTier: MonsterTier, killPos: THREE.Vector3) {
  if (d.exit) return;
  if (killedTier === 'boss') {
    summonExit(d, killPos);
    return;
  }
  const goal = getKillGoal(d.level);
  if (goal > 0 && d.killsThisNight >= goal) summonExit(d);
}

// Ranged stalker — stops at SPITTER_OPTIMAL_RANGE and spits a green
// projectile every (telegraph + cooldown). Lurkers + boss stay melee.
const SPITTER_OPTIMAL_RANGE = 7.5;
const SPITTER_RETREAT_RANGE = 4.0;   // if player gets closer than this, back away
const PROJECTILE_SPEED = 12;
const PROJECTILE_TTL = 1.4;
const PROJECTILE_HIT_RADIUS = 0.65;

// Reset everything that changes per night (monsters, crystals, pillars)
// while preserving cumulative score. Pillars re-shuffle each night so the
// street layout feels different per round.
export function startLevel(d: GameRef, level: number) {
  const tuning = getLevelTuning(level);
  d.level = level;
  d.levelT = 0;
  d.levelCleared = false;
  d.monsters = [];
  d.crystals = [];
  d.pillars = [];
  d.exit = null;
  d.killsThisNight = 0;
  d.exitJustOpened = false;
  for (let i = 0; i < tuning.pillarCount; i++) d.pillars.push(spawnPillar(tuning.pillarScaleBias, level));
  d.monsterSpawnTimer = 0;
  d.crystalRespawnTimer = 0;
  d.pos.set(0, 0, 5);
  d.rot = Math.PI;

  for (let i = 0; i < tuning.crystalInitial; i++) spawnCrystal(d);
  // Initial spawn pool: use the weighted tier roll to pick variety
  // across the lurker + stalker count budget so even night 1 already
  // has a runner + a brute or two on screen.
  const initialCount = tuning.lurkerCount + tuning.stalkerCount;
  for (let i = 0; i < initialCount; i++) {
    spawnMonsterTier(d, tuning, rollSpawnTier(level));
  }
  if (tuning.isBoss) spawnMonsterTier(d, tuning, 'boss');
}

function spawnCrystal(d: GameRef, _type?: CrystalType) {
  if (d.crystals.length >= CRYSTAL_MAX) return;
  const pos = randomSpawnPos(d, 5, 3);
  d.crystals.push({ id: nextId(), position: pos, type: 'xp' });
}

// Pillar variant weights — driven by the level's *palette cycle index*
// (twilight / dusk / blackout) so the props match the lighting. Endless:
// every 3rd night returns to the blackout (apocalypse) cycle and unlocks
// burning barrels, wrecked trucks, steam grates, and body bags. Twilight
// and dusk cycles share the original streetlamp / sedan / dumpster trio
// until the N2 siege pass adds more.
const PILLAR_WEIGHTS_BY_CYCLE: { v: PillarVariant; w: number }[][] = [
  // (level-1) % 3 === 0 → twilight
  [
    { v: 'spike',   w: 5 },
    { v: 'dome',    w: 3 },
    { v: 'cluster', w: 2 },
  ],
  // (level-1) % 3 === 1 → dusk · siege cycle. The base trio is rebalanced
  // down and 4 siege props enter: A-frame barricades, boarded shopfronts,
  // tipped dumpsters spilling trash, and overturned police cruisers with
  // a still-strobing red/blue lightbar.
  [
    { v: 'spike',            w: 4 },
    { v: 'dome',             w: 2 },
    { v: 'cluster',          w: 2 },
    { v: 'barricade',        w: 3 },
    { v: 'boardedShop',      w: 2 },
    { v: 'tippedDumpster',   w: 2 },
    { v: 'wreckCruiser',     w: 2 },
  ],
  // (level-1) % 3 === 2 → blackout
  [
    { v: 'spike',      w: 4 },
    { v: 'dome',       w: 2 },
    { v: 'cluster',    w: 2 },
    { v: 'burnBarrel', w: 3 },
    { v: 'wreckTruck', w: 1 },
    { v: 'steamGrate', w: 2 },
    { v: 'bodyBag',    w: 2 },
  ],
];
function pickPillarVariant(level: number): PillarVariant {
  const table = PILLAR_WEIGHTS_BY_CYCLE[(level - 1) % 3] || PILLAR_WEIGHTS_BY_CYCLE[0];
  const total = table.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of table) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return 'spike';
}

function spawnPillar(scaleBias: number = 1.0, level: number = 1): Pillar {
  // Keep pillars away from the dead center (where the altar sits) and the
  // very edge (where the perimeter wall hugs).
  let x: number, z: number;
  for (let i = 0; i < 20; i++) {
    x = (Math.random() - 0.5) * (PLAYFIELD - 6);
    z = (Math.random() - 0.5) * (PLAYFIELD - 6);
    if (Math.hypot(x, z) > 4) break;
  }
  return {
    id: nextId(),
    position: new THREE.Vector3(x!, 0, z!),
    scale: (0.75 + Math.random() * 1.6) * scaleBias,
    rot: Math.random() * Math.PI * 2,
    variant: pickPillarVariant(level),
  };
}

export type PickupKind = 'gold' | 'red' | 'green' | 'blue';

export interface GameLoopParams {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  stick: Stick;
  /** Selected survivor archetype — drives the weapon descriptor + future
   *  per-class perks. Drives no movement/cosmetic behavior; the Player
   *  component renders the matching body + weapon prop. */
  survivor: SurvivorId;
  onScore: (s: number) => void;
  onDepth: (d: number) => void;
  onLightRadius: (r: number) => void;
  onGameOver: (final: number) => void;
  onPickup?: (kind: PickupKind, value: number) => void;
  onStrikeHit?: () => void;
  playSfx: (k: SfxKey) => void;
  haptic?: (k: 'light' | 'heavy') => void;
}

export function useGameLoop(p: GameLoopParams) {
  if (!p.state.current.initialized) {
    const d = p.state.current;
    // startLevel handles pillars now (re-shuffled per level via tuning).
    startLevel(d, d.level || 1);
    d.initialized = true;
  }

  useFrame((_, delta) => {
    const d = p.state.current;
    if (!p.playing || d.gameOver || d.levelCleared || d.victory) return;
    const c = Math.min(delta, 0.05);
    d.time += c;
    d.levelT += c;
    const tuning = getLevelTuning(d.level);

    // Time is now informational only — the night clears when the player
    // touches the exit beacon (see EXIT block below).

    // ---- PLAYER MOVEMENT ----
    const stickMag = Math.hypot(p.stick.x, p.stick.y);
    const moveSpeed = PLAYER_SPEED * d.perkSpeedMul;
    if (p.stick.active && stickMag > 0.1) {
      const inv = 1 / Math.max(stickMag, 0.001);
      const dx = p.stick.x * inv;
      const dz = p.stick.y * inv;
      d.pos.x += dx * moveSpeed * c;
      d.pos.z += dz * moveSpeed * c;
      d.rot = Math.atan2(dx, dz);
      d.speed = moveSpeed;
    } else {
      d.speed *= Math.exp(-6 * c);
    }
    d.pos.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, d.pos.x));
    d.pos.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, d.pos.z));

    // ---- COLLISIONS — pillars + central altar ----
    // Push the player out of solid obstacles along the shortest axis. Cheap
    // O(N) per pillar; N is small (~28) so this is fine. Walkable variants
    // (ground steam grate, body bag) skip the collision check entirely so
    // the player passes right over them.
    for (const p of d.pillars) {
      if (p.variant === 'steamGrate' || p.variant === 'bodyBag') continue;
      // Effective collision radius: scale * base footprint + player radius.
      // Footprints by variant — these match the renderer's bottom geometry.
      const base =
        p.variant === 'dome'           ? 1.15 :
        p.variant === 'cluster'        ? 0.95 :
        p.variant === 'wreckTruck'     ? 1.80 :
        p.variant === 'wreckCruiser'   ? 1.40 :
        p.variant === 'boardedShop'    ? 1.05 :
        p.variant === 'tippedDumpster' ? 1.10 :
        p.variant === 'barricade'      ? 0.85 :
        p.variant === 'burnBarrel'     ? 0.55 :
        0.70;
      const r = base * p.scale + PLAYER_RADIUS;
      const dx = d.pos.x - p.position.x;
      const dz = d.pos.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < r) {
        const n = 1 / dist;
        d.pos.x = p.position.x + dx * n * r;
        d.pos.z = p.position.z + dz * n * r;
      }
    }
    // Altar at world origin — basin outer radius 1.35.
    {
      const ALTAR_R = 1.35 + PLAYER_RADIUS;
      const dx = d.pos.x;
      const dz = d.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < ALTAR_R) {
        const n = 1 / dist;
        d.pos.x = dx * n * ALTAR_R;
        d.pos.z = dz * n * ALTAR_R;
      }
    }

    // (lantern light / depth score / walls — removed; Block Party kills earn
    // score via SCORE_KILL, and the only "light" is the hero's muzzle flash.)
    p.onLightRadius(0);

    // ---- ZOMBIES — pursue + bite (no flee-from-light) ----
    let nearestDist = 99;
    for (let i = d.monsters.length - 1; i >= 0; i--) {
      const m = d.monsters[i];
      const dx = d.pos.x - m.position.x;
      const dz = d.pos.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) nearestDist = dist;

      const speedK     = MONSTER_SPEED_K[m.tier];
      const telegraphK = m.tier === 'boss' ? 0.85 : m.tier === 'stalker' ? 0.92 : m.tier === 'runner' ? 0.85 : 1.0;
      const rangeK     = m.tier === 'boss' ? 1.10 : m.tier === 'stalker' ? 1.05 : m.tier === 'brute' ? 1.15 : 1.0;
      const monsterBaseSpeed = MONSTER_BASE_SPEED * tuning.monsterSpeed * speedK;
      const myTelegraph = tuning.strikeTelegraph * telegraphK;
      const myRangeMax  = tuning.strikeRangeMax  * rangeK;

      // DYING — corpse is in flight after being killed. Integrate the
      // launch velocity, tumble, plow through any live monsters in the
      // path, then finalize with a big death burst.
      if (m.dying) {
        const FLIGHT_LIFE = 0.6;
        m.dyingT += c;
        m.position.x += m.flightVX * c;
        m.position.z += m.flightVZ * c;
        m.flightVX *= 0.91;
        m.flightVZ *= 0.91;
        m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
        m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
        m.rotation += m.flightSpin * c;     // visual tumble cue for the renderer

        // BOWLING — check live monsters in front of the corpse's path.
        // First impact slows the corpse and damages + knocks back the
        // victim. We don't break on first hit so a fast corpse can plow
        // through 2-3 zombies.
        const corpseR = 0.7;
        for (let k = d.monsters.length - 1; k >= 0; k--) {
          const other = d.monsters[k];
          if (k === i || other.dying) continue;
          const odx = other.position.x - m.position.x;
          const odz = other.position.z - m.position.z;
          if (Math.hypot(odx, odz) > corpseR + 0.7) continue;
          // Body-check.
          const corpseDmg = CORPSE_HIT_DMG[m.tier];
          other.hp -= corpseDmg;
          other.hitFlashT = 0.10;
          // Transfer momentum — the live one flies the corpse's way.
          const transferF = 0.55;
          const vmag = Math.hypot(m.flightVX, m.flightVZ);
          if (vmag > 0.5) {
            other.knockbackVX = (m.flightVX / vmag) * vmag * transferF;
            other.knockbackVZ = (m.flightVZ / vmag) * vmag * transferF;
            other.knockbackT  = 0.18;
          }
          spawnBloodSplats(d, other.position.x, other.position.z, 4, 0.8, m.flightVX, m.flightVZ);
          // Corpse loses 60% velocity per hit.
          m.flightVX *= 0.40;
          m.flightVZ *= 0.40;
          // If the victim is also dead, queue THEM for launch too. Chain!
          if (other.hp <= 0 && !other.dying) {
            d.kills += 1;
            d.killsThisNight += 1;
            d.score += SCORE_KILL[other.tier];
            p.onScore(Math.floor(d.score));
            emitFx(d, 'monster_kill', other.position.x, other.position.z);
            checkExitTrigger(d, other.tier, other.position);
            const launchV2 = LAUNCH_SPEED[other.tier];
            other.dying = true;
            other.dyingT = 0;
            other.flightVX = (m.flightVX / Math.max(0.001, vmag)) * launchV2 * 0.85;
            other.flightVZ = (m.flightVZ / Math.max(0.001, vmag)) * launchV2 * 0.85;
            other.flightSpin = (Math.random() < 0.5 ? 1 : -1) * (12 + Math.random() * 10);
            other.deathStyle = Math.floor(Math.random() * 4);
            other.deathArc = 1.8 + Math.random() * 1.4;
            if (d.crystals.length < CRYSTAL_MAX) {
              d.crystals.push({ id: nextId(), position: other.position.clone(), type: 'xp' });
            }
            p.playSfx('kill');
          }
        }

        // Finalize — TTL expired OR speed dropped low enough that the
        // body is basically on the ground. Big death-burst then splice.
        const speedNow = Math.hypot(m.flightVX, m.flightVZ);
        if (m.dyingT >= FLIGHT_LIFE || speedNow < 1.2) {
          const burst =
            m.tier === 'boss'    ? 48 :
            m.tier === 'brute'   ? 34 :
            m.tier === 'stalker' ? 24 :
            m.tier === 'runner'  ? 16 :
                                   20;
          spawnBloodSplats(d, m.position.x, m.position.z, burst, m.tier === 'boss' ? 1.8 : 1.3);
          d.monsters.splice(i, 1);
        }
        continue;
      }

      // KNOCKBACK — when knockbackT > 0, the AI movement code below is
      // suppressed and the zombie skids along its current knockback
      // velocity. The velocity decays each frame so the slide is short.
      if (m.knockbackT > 0) {
        m.knockbackT = Math.max(0, m.knockbackT - c);
        m.position.x += m.knockbackVX * c;
        m.position.z += m.knockbackVZ * c;
        m.knockbackVX *= 0.92;     // slower decay = longer visible slide
        m.knockbackVZ *= 0.92;
        m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
        m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
        continue;       // skip AI this frame while flying back
      }

      // STALKER = RANGED SPITTER. Stops at SPITTER_OPTIMAL_RANGE, keeps
      // distance, and spits at the player. Distinct from melee lurkers
      // and the boss who must close to bite.
      if (m.tier === 'stalker') {
        if (m.state === 'cooldown') {
          m.cooldownT -= c;
          // Keep a comfortable spit distance during cooldown.
          if (dist > SPITTER_OPTIMAL_RANGE + 1.5) {
            const n = 1 / Math.max(dist, 0.001);
            m.velocity.x = dx * n * monsterBaseSpeed * 0.6;
            m.velocity.z = dz * n * monsterBaseSpeed * 0.6;
          } else if (dist < SPITTER_RETREAT_RANGE) {
            const n = 1 / Math.max(dist, 0.001);
            m.velocity.x = -dx * n * monsterBaseSpeed * 0.9;
            m.velocity.z = -dz * n * monsterBaseSpeed * 0.9;
          } else {
            m.velocity.x *= 0.7;
            m.velocity.z *= 0.7;
          }
          if (m.cooldownT <= 0) m.state = 'lurking';
        } else if (m.state === 'lurking') {
          // Drift to optimal spit distance.
          if (dist > SPITTER_OPTIMAL_RANGE + 0.5) {
            const n = 1 / Math.max(dist, 0.001);
            m.velocity.x = dx * n * monsterBaseSpeed * 0.7;
            m.velocity.z = dz * n * monsterBaseSpeed * 0.7;
          } else if (dist < SPITTER_RETREAT_RANGE) {
            const n = 1 / Math.max(dist, 0.001);
            m.velocity.x = -dx * n * monsterBaseSpeed * 0.9;
            m.velocity.z = -dz * n * monsterBaseSpeed * 0.9;
          } else {
            m.velocity.x *= 0.6;
            m.velocity.z *= 0.6;
          }
          // Enter telegraph when at a decent distance.
          if (dist > SPITTER_RETREAT_RANGE && dist < 12) {
            m.state = 'striking';
            m.strikeT = 0;
            const inv = 1 / Math.max(dist, 0.001);
            m.strikeAimX = dx * inv;
            m.strikeAimZ = dz * inv;
            emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
            p.playSfx('strike_telegraph');
          }
        } else if (m.state === 'striking') {
          m.velocity.x *= 0.7;
          m.velocity.z *= 0.7;
          m.strikeT += c;
          if (m.strikeT >= myTelegraph) {
            // FIRE — spawn a projectile that flies along the locked aim.
            d.enemyProjectiles.push({
              id: nextId(),
              position: new THREE.Vector3(m.position.x, 1.1, m.position.z),
              dirX: m.strikeAimX,
              dirZ: m.strikeAimZ,
              bornAt: d.time,
              ttl: PROJECTILE_TTL,
            });
            p.playSfx('strike_hit');
            m.state = 'cooldown';
            m.cooldownT = tuning.strikeCooldown * 1.4;   // longer between spits
            m.strikeT = 0;
          }
        }

        m.position.x += m.velocity.x * c;
        m.position.z += m.velocity.z * c;
        if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
        m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
        m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
        continue;
      }

      // EXPLODER — runs at the player and self-destructs. No telegraph
      // bite, just a brief priming flash then BOOM with AOE damage if
      // within range. Faster than a lurker.
      if (m.tier === 'exploder') {
        const EXPLODE_TRIGGER = 1.5;
        const EXPLODE_RADIUS = 2.6;
        if (m.state !== 'striking') {
          // Sprint toward player.
          if (dist > 0.001) {
            const n = 1 / dist;
            m.velocity.x = dx * n * monsterBaseSpeed;
            m.velocity.z = dz * n * monsterBaseSpeed;
          }
          if (dist < EXPLODE_TRIGGER) {
            m.state = 'striking';
            m.strikeT = 0;
            emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
            p.playSfx('strike_telegraph');
          }
        } else {
          // Priming — slow to a halt, then explode.
          m.velocity.x *= 0.6;
          m.velocity.z *= 0.6;
          m.strikeT += c;
          if (m.strikeT >= 0.45) {
            // BOOM: heavy splat shower, AOE check, self-remove + score.
            spawnBloodSplats(d, m.position.x, m.position.z, 22, 1.5);
            shakeCamera(d, 0.40, 0.18);
            p.playSfx('strike_hit');
            const aoeDx = d.pos.x - m.position.x;
            const aoeDz = d.pos.z - m.position.z;
            if (Math.hypot(aoeDx, aoeDz) < EXPLODE_RADIUS && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
              d.hp -= 1;
              d.iframesT = 1.2;
              shakeCamera(d, 0.95, 0.36);
              emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
              p.haptic?.('heavy');
              p.onStrikeHit?.();
              if (d.hp <= 0) {
                p.playSfx('game_over');
                d.gameOver = true;
                setTimeout(() => p.onGameOver(Math.floor(d.score)), 600);
                return;
              }
            }
            // Award the kill to the player + remove this exploder.
            d.kills += 1;
            d.killsThisNight += 1;
            d.score += SCORE_KILL.exploder;
            p.onScore(Math.floor(d.score));
            emitFx(d, 'monster_kill', m.position.x, m.position.z);
            checkExitTrigger(d, 'exploder', m.position);
            d.monsters.splice(i, 1);
            continue;
          }
        }
        m.position.x += m.velocity.x * c;
        m.position.z += m.velocity.z * c;
        if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
        m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
        m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
        continue;
      }

      // GHOST — phaser. Floats straight at the player ignoring pillar
      // collisions (handled later by the renderer; gameplay-wise the
      // pillar push code skips ghosts). Touches to deal melee damage
      // like a lurker, but you can't hide behind a parked car from it.
      if (m.tier === 'ghost') {
        if (m.state === 'cooldown') {
          m.cooldownT -= c;
          if (dist > 0.001) {
            const n = 1 / dist;
            m.velocity.x = dx * n * monsterBaseSpeed * 0.5;
            m.velocity.z = dz * n * monsterBaseSpeed * 0.5;
          }
          if (m.cooldownT <= 0) m.state = 'lurking';
        } else if (m.state === 'lurking') {
          if (dist > 0.001) {
            const n = 1 / dist;
            m.velocity.x = dx * n * monsterBaseSpeed;
            m.velocity.z = dz * n * monsterBaseSpeed;
          }
          if (dist > MONSTER_STRIKE_RANGE_MIN && dist < myRangeMax) {
            m.state = 'striking';
            m.strikeT = 0;
            const inv = 1 / Math.max(dist, 0.001);
            m.strikeAimX = dx * inv;
            m.strikeAimZ = dz * inv;
            emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
            p.playSfx('strike_telegraph');
          }
        } else if (m.state === 'striking') {
          m.velocity.x *= 0.85;
          m.velocity.z *= 0.85;
          m.strikeT += c;
          if (m.strikeT >= myTelegraph + MONSTER_STRIKE_LIVE) {
            m.state = 'cooldown';
            m.cooldownT = tuning.strikeCooldown;
            m.strikeT = 0;
          }
        }
        m.position.x += m.velocity.x * c;
        m.position.z += m.velocity.z * c;
        if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
        m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
        m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));

        // STRIKE HIT — ghost has melee range (no projectile).
        if (m.state === 'striking' && m.strikeT >= myTelegraph) {
          const handX = m.position.x + m.strikeAimX * myRangeMax;
          const handZ = m.position.z + m.strikeAimZ * myRangeMax;
          const hdx = handX - d.pos.x;
          const hdz = handZ - d.pos.z;
          if (Math.hypot(hdx, hdz) < MONSTER_STRIKE_HIT_RADIUS && d.time > GRACE_PERIOD && d.iframesT <= 0) {
            emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
            p.playSfx('strike_hit');
            p.haptic?.('heavy');
            p.onStrikeHit?.();
            d.hp -= 1;
            d.iframesT = 1.2;
            shakeCamera(d, 0.85, 0.32);
            if (d.hp <= 0) {
              p.playSfx('game_over');
              d.gameOver = true;
              setTimeout(() => p.onGameOver(Math.floor(d.score)), 600);
              return;
            }
          }
        }
        continue;
      }

      // MELEE — lurkers, runners, brutes, and boss must close to touch range.
      if (m.state === 'cooldown') {
        m.cooldownT -= c;
        if (dist > 0.001) {
          const n = 1 / dist;
          m.velocity.x = -dx * n * (monsterBaseSpeed * 0.35);
          m.velocity.z = -dz * n * (monsterBaseSpeed * 0.35);
        }
        if (m.cooldownT <= 0) m.state = 'lurking';
      } else if (m.state === 'lurking') {
        if (dist > MONSTER_STRIKE_RANGE_MIN + 0.2) {
          if (dist > 0.001) {
            const n = 1 / dist;
            m.velocity.x = dx * n * monsterBaseSpeed;
            m.velocity.z = dz * n * monsterBaseSpeed;
          }
        } else {
          m.velocity.x *= 0.5;
          m.velocity.z *= 0.5;
        }
        if (dist > MONSTER_STRIKE_RANGE_MIN && dist < myRangeMax) {
          m.state = 'striking';
          m.strikeT = 0;
          const inv = 1 / Math.max(dist, 0.001);
          m.strikeAimX = dx * inv;
          m.strikeAimZ = dz * inv;
          emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
          p.playSfx('strike_telegraph');
        }
      } else if (m.state === 'striking') {
        m.velocity.x *= 0.85;
        m.velocity.z *= 0.85;
        m.strikeT += c;
        if (m.strikeT >= myTelegraph + MONSTER_STRIKE_LIVE) {
          m.state = 'cooldown';
          m.cooldownT = tuning.strikeCooldown;
          m.strikeT = 0;
        }
      }

      if (m.state !== 'striking') {
        m.position.x += m.velocity.x * c;
        m.position.z += m.velocity.z * c;
        if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
      }
      m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
      m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));

      // STRIKE HIT TEST — during the live window only. Block Party uses a
      // 3-heart HP system with a 1.2s invulnerability window after each
      // bite; instakill only on the heart that drops you to 0.
      if (m.state === 'striking' && m.strikeT >= myTelegraph) {
        const handX = m.position.x + m.strikeAimX * myRangeMax;
        const handZ = m.position.z + m.strikeAimZ * myRangeMax;
        const hdx = handX - d.pos.x;
        const hdz = handZ - d.pos.z;
        if (Math.hypot(hdx, hdz) < MONSTER_STRIKE_HIT_RADIUS && d.time > GRACE_PERIOD && d.iframesT <= 0) {
          emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
          p.playSfx('strike_hit');
          p.haptic?.('heavy');
          p.onStrikeHit?.();
          d.hp -= 1;
          d.iframesT = 1.2;
          // Heavy player-damage shake.
          shakeCamera(d, 0.85, 0.32);
          if (d.hp <= 0) {
            p.playSfx('game_over');
            d.gameOver = true;
            setTimeout(() => p.onGameOver(Math.floor(d.score)), 600);
            return;
          }
        }
      }
    }
    d.nearestMonsterDist = nearestDist;

    // ---- AUTO-FIRE (Vampire Survivors model + 110° forward fire arc) ----
    // Hero can only target zombies inside ±55° of body facing. Per-class
    // weapon spec drives the burst (cop = single pistol, nurse = 3-dart
    // stagger, biker = 5-pellet cone). Bullets spawn from the gun's world
    // position so the muzzle flash + tracer line up with the held weapon.
    d.fireCooldown = Math.max(0, d.fireCooldown - c);
    d.muzzleFlashT = Math.max(0, d.muzzleFlashT - c);
    d.iframesT = Math.max(0, d.iframesT - c);
    d.cameraShakeT = Math.max(0, d.cameraShakeT - c);
    // When the shake window fully decays, drop the stored magnitude too
    // so the next small impulse isn't immediately squashed by a stale
    // big magnitude from a long-ago event.
    if (d.cameraShakeT === 0) d.cameraShakeMag = 0;

    // ---- BLOOD SPLAT PHYSICS ----
    // Each splat ballistics-arc with gravity, then expires at end-of-life
    // or when it touches the asphalt.
    const GRAVITY = 14;
    for (let i = d.bloodSplats.length - 1; i >= 0; i--) {
      const s = d.bloodSplats[i];
      const age = d.time - s.bornAt;
      if (age > s.life || s.position.y <= 0.02) {
        d.bloodSplats.splice(i, 1);
        continue;
      }
      s.velocity.y -= GRAVITY * c;
      s.position.x += s.velocity.x * c;
      s.position.y += s.velocity.y * c;
      s.position.z += s.velocity.z * c;
      // On ground contact, kill upward motion and let it skid briefly.
      if (s.position.y < 0.04) {
        s.position.y = 0.04;
        s.velocity.y = 0;
        s.velocity.x *= 0.55;
        s.velocity.z *= 0.55;
      }
    }

    let target: Monster | null = null;
    let targetYaw = 0;
    let bestD2 = AIM_RANGE * AIM_RANGE;
    for (const m of d.monsters) {
      if (m.dying) continue;     // don't waste shots on bodies still flying
      const dxm = m.position.x - d.pos.x;
      const dzm = m.position.z - d.pos.z;
      const dd = dxm * dxm + dzm * dzm;
      if (dd >= bestD2) continue;
      const bearing = Math.atan2(dxm, dzm);
      const yaw = Math.atan2(Math.sin(bearing - d.rot), Math.cos(bearing - d.rot));
      if (Math.abs(yaw) > FIRE_ARC_HALF) continue;
      bestD2 = dd;
      target = m;
      targetYaw = yaw;
    }
    d.aimYaw = target ? targetYaw : null;

    if (target && d.fireCooldown <= 0) {
      const w = weaponEffectiveSpec(d.currentWeaponId, d.currentWeaponLevel);
      const tdx = target.position.x - d.pos.x;
      const tdz = target.position.z - d.pos.z;
      const baseAngle = Math.atan2(tdx, tdz);     // = d.rot once we lerp body toward target
      // Total shots = base weapon count + perk bonus. Cones and bursts both
      // benefit from +projectiles.
      const totalShots = w.count + d.perkExtraProjectiles;
      for (let i = 0; i < totalShots; i++) {
        let angle = baseAngle;
        if (totalShots > 1) {
          if (w.spreadRad > 0 && w.burstDelay === 0) {
            // Cone — spread evenly across [-spread, +spread]
            const t01 = (i - (totalShots - 1) / 2) / Math.max(1, (totalShots - 1) / 2);
            angle = baseAngle + t01 * w.spreadRad;
          } else if (w.burstDelay > 0) {
            // Burst — tiny random jitter inside the band
            angle = baseAngle + (Math.random() - 0.5) * 2 * w.spreadRad;
          }
        }
        const isCrit = d.perkCritChance > 0 && Math.random() < d.perkCritChance;
        const dmg = w.dmgPerShot * d.perkDmgMul * (isCrit ? 2 : 1);
        d.pendingShots.push({
          fireAt: d.time + i * w.burstDelay,
          dirX: Math.sin(angle),
          dirZ: Math.cos(angle),
          dmg,
        });
      }
      d.fireCooldown = w.cooldown * d.perkFireRateMul;
      // Smoothly turn body toward the locked target so the next burst can
      // hit wider angles without snap-turning.
      const facingDelta = Math.atan2(Math.sin(targetYaw), Math.cos(targetYaw));
      d.rot += facingDelta * 0.55;
    }

    // Drain pendingShots whose fireAt has arrived. Each shot spawns its
    // own bullet at the gun's world position + plays a fresh muzzle flash.
    for (let i = d.pendingShots.length - 1; i >= 0; i--) {
      const ps = d.pendingShots[i];
      if (ps.fireAt > d.time) continue;
      const cosR = Math.cos(d.rot);
      const sinR = Math.sin(d.rot);
      const gunLocalX = 0.30;
      const gunLocalZ = 0.45;
      const gunWorldDx = gunLocalX * cosR + gunLocalZ * sinR;
      const gunWorldDz = -gunLocalX * sinR + gunLocalZ * cosR;
      d.bullets.push({
        id: nextId(),
        position: new THREE.Vector3(d.pos.x + gunWorldDx, 0.95, d.pos.z + gunWorldDz),
        dirX: ps.dirX,
        dirZ: ps.dirZ,
        bornAt: d.time,
        dmg: ps.dmg,
        speedMul: weaponEffectiveSpec(d.currentWeaponId, d.currentWeaponLevel).speedMul,
        weaponId: d.currentWeaponId,
        pierceLeft: d.perkPierce,
        hitIds: new Set<number>(),
      });
      d.muzzleFlashT = 0.07;
      emitFx(d, 'muzzle_flash', d.pos.x + gunWorldDx, d.pos.z + gunWorldDz);
      p.playSfx('shoot');
      d.pendingShots.splice(i, 1);
    }

    // ---- BULLET UPDATE + COLLISION ----
    for (let i = d.bullets.length - 1; i >= 0; i--) {
      const b = d.bullets[i];
      b.position.x += b.dirX * BULLET_SPEED * b.speedMul * c;
      b.position.z += b.dirZ * BULLET_SPEED * b.speedMul * c;
      if (d.time - b.bornAt > BULLET_TTL
          || Math.abs(b.position.x) > ARENA_HALF
          || Math.abs(b.position.z) > ARENA_HALF) {
        d.bullets.splice(i, 1);
        continue;
      }
      let alive = true;
      for (let j = d.monsters.length - 1; j >= 0; j--) {
        if (!alive) break;
        const m = d.monsters[j];
        if (m.dying) continue;                   // bullets ignore flying corpses
        if (b.hitIds.has(m.id)) continue;        // pierce: don't double-tap
        const bdx = b.position.x - m.position.x;
        const bdz = b.position.z - m.position.z;
        const hitR = BULLET_RADIUS + (m.tier === 'boss' ? 1.4 : 0.55);
        if (bdx * bdx + bdz * bdz < hitR * hitR) {
          m.hp -= b.dmg;
          m.hitFlashT = 0.10;
          b.hitIds.add(m.id);
          emitFx(d, 'bullet_hit', b.position.x, b.position.z);
          // Bigger directional spray on every hit — blood SHOOTS forward
          // along the bullet vector, not a small omni puddle.
          spawnBloodSplats(d, b.position.x, b.position.z, 8, 1.0, b.dirX, b.dirZ);
          // Knockback IMPULSE — set a velocity so the zombie SKIDS back
          // visibly rather than teleporting one step. Per-tier table
          // (constants.ts) so brute + boss barely move and lurker /
          // exploder fly back.
          // Per-tier table (constants.ts). Add a small lateral kick so
          // each hit looks slightly different, not a perfectly straight
          // shove. Knockback window long enough to read as a real
          // pushback, not a teleport.
          const kbSpeed = MONSTER_KNOCKBACK_V[m.tier];
          const sideKick = (Math.random() - 0.5) * 0.35;        // ±10° lateral
          const dirAngle = Math.atan2(b.dirX, b.dirZ) + sideKick;
          m.knockbackVX = Math.sin(dirAngle) * kbSpeed;
          m.knockbackVZ = Math.cos(dirAngle) * kbSpeed;
          m.knockbackT  = (m.tier === 'boss' || m.tier === 'brute') ? 0.15 : 0.30;
          // NB: no shake on per-bullet hits — auto-fire shoots ~3/s and the
          // stacked jitter felt like the whole camera was vibrating. The
          // blood splats + knockback already sell the impact.
          if (b.pierceLeft > 0) {
            b.pierceLeft -= 1;
          } else {
            d.bullets.splice(i, 1);
            alive = false;
          }
          if (m.hp <= 0) {
            // ── KILL CREDIT — immediate score, XP drop, lifesteal,
            // SFX. The corpse itself is launched into the air instead of
            // being spliced; it body-checks live monsters in its path
            // before exploding at the end.
            d.kills += 1;
            d.killsThisNight += 1;
            d.score += SCORE_KILL[m.tier];
            p.onScore(Math.floor(d.score));
            emitFx(d, 'monster_kill', m.position.x, m.position.z);
            checkExitTrigger(d, m.tier, m.position);
            // Initial blood burst at hit point — mid-size directional
            // spray; the BIG explosion happens at corpse finalize.
            spawnBloodSplats(
              d, m.position.x, m.position.z,
              m.tier === 'boss' ? 26 : m.tier === 'brute' ? 18 : 12,
              m.tier === 'boss' ? 1.6 : 1.1,
              b.dirX, b.dirZ,
            );
            if (m.tier === 'boss') shakeCamera(d, 0.95, 0.55);
            // Launch the corpse — flies along the bullet vector, tumbles
            // for ~0.6s, bowls into anything in its path. deathStyle
            // randomizes the tumble axis + limp pose so a wave of dying
            // zombies doesn't look like 5 identical ragdolls.
            const launchV = LAUNCH_SPEED[m.tier];
            // ±20° lateral spray on launch so corpses don't all fly in
            // a perfectly straight line — busy crowds look chaotic.
            const launchSide = (Math.random() - 0.5) * 0.7;
            const launchAngle = Math.atan2(b.dirX, b.dirZ) + launchSide;
            m.dying = true;
            m.dyingT = 0;
            m.flightVX = Math.sin(launchAngle) * launchV;
            m.flightVZ = Math.cos(launchAngle) * launchV;
            m.flightSpin = (Math.random() < 0.5 ? 1 : -1) * (12 + Math.random() * 10);
            m.deathStyle = Math.floor(Math.random() * 4);
            m.deathArc = 1.8 + Math.random() * 1.4;        // 1.8 .. 3.2u peak
            // Drop an XP gem where the zombie fell (capped by CRYSTAL_MAX).
            if (d.crystals.length < CRYSTAL_MAX) {
              d.crystals.push({
                id: nextId(),
                position: m.position.clone(),
                type: 'xp',
              });
            }
            // Lifesteal — chance per kill to restore one heart.
            if (d.perkKillHealChance > 0
                && d.hp < d.maxHp
                && Math.random() < d.perkKillHealChance) {
              d.hp = Math.min(d.maxHp, d.hp + 1);
            }
            p.playSfx('kill');
            p.haptic?.(m.tier === 'boss' ? 'heavy' : 'light');
          }
          // With pierce, the bullet stays alive and the j loop keeps
          // walking the monster list looking for the next pierce target;
          // without pierce, `alive` was flipped above and the next j
          // iteration breaks early.
        }
      }
    }

    // ---- ENEMY PROJECTILES ----
    // Spitter globs fly straight; they hit on player overlap or expire
    // at ttl. Damage is one heart (matches melee). Player iframes block
    // damage same as melee bites.
    for (let i = d.enemyProjectiles.length - 1; i >= 0; i--) {
      const proj = d.enemyProjectiles[i];
      proj.position.x += proj.dirX * PROJECTILE_SPEED * c;
      proj.position.z += proj.dirZ * PROJECTILE_SPEED * c;
      const age = d.time - proj.bornAt;
      if (age > proj.ttl
          || Math.abs(proj.position.x) > ARENA_HALF
          || Math.abs(proj.position.z) > ARENA_HALF) {
        d.enemyProjectiles.splice(i, 1);
        continue;
      }
      const pdx = proj.position.x - d.pos.x;
      const pdz = proj.position.z - d.pos.z;
      if (Math.hypot(pdx, pdz) < PROJECTILE_HIT_RADIUS + PLAYER_RADIUS && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
        d.hp -= 1;
        d.iframesT = 1.2;
        emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
        p.playSfx('strike_hit');
        p.haptic?.('heavy');
        p.onStrikeHit?.();
        shakeCamera(d, 0.85, 0.32);
        d.enemyProjectiles.splice(i, 1);
        if (d.hp <= 0) {
          p.playSfx('game_over');
          d.gameOver = true;
          setTimeout(() => p.onGameOver(Math.floor(d.score)), 600);
          return;
        }
      }
    }

    // ---- MONSTERS — decay hit flash ----
    for (const m of d.monsters) {
      if (m.hitFlashT > 0) m.hitFlashT = Math.max(0, m.hitFlashT - c);
    }

    // ---- MONSTER SPAWN OVER TIME ----
    // Two layers: a tight trickle that keeps refilling the swarm + a
    // periodic surge that drops a small wave of zombies all at once so the
    // pressure has visible peaks.
    d.monsterSpawnTimer += c;
    if (d.monsterSpawnTimer >= tuning.monsterSpawnInterval) {
      d.monsterSpawnTimer = 0;
      spawnMonsterTier(d, tuning, rollSpawnTier(d.level));
    }
    d.surgeTimer += c;
    if (d.surgeTimer >= SURGE_PERIOD) {
      d.surgeTimer = 0;
      const count = SURGE_COUNT_BASE + (d.level - 1) * SURGE_COUNT_PER_NIGHT;
      for (let i = 0; i < count; i++) {
        spawnMonsterTier(d, tuning, rollSpawnTier(d.level));
      }
    }

    // ---- EXIT PICKUP ----
    // Once the beacon is summoned, touching it clears the night. Night 3
    // exit triggers final victory.
    if (d.exit) {
      const ex = d.exit.position;
      const exDx = ex.x - d.pos.x;
      const exDz = ex.z - d.pos.z;
      if (Math.hypot(exDx, exDz) < EXIT_PICKUP_RADIUS) {
        const timeBonus = 0;
        const levelBonus = 100 * d.level;
        d.score += levelBonus + timeBonus;
        p.onScore(Math.floor(d.score));
        p.playSfx('pickup_green');
        p.haptic?.('heavy');
        d.levelCleared = true;
        // Endless: no terminal victory — every cleared night queues the
        // next one. Death is the only end state.
        return;
      }
    }

    // ---- WEAPON DROPS ----
    // Vampire-Survivors-style upgrade: re-picking the same weapon levels
    // it up; a different one swaps + resets to level 1. Pool includes
    // the current weapon UNLESS it's already maxed (no point dropping
    // a slot the player can't use).
    d.weaponDropTimer += c;
    if (d.weaponDropTimer >= WEAPON_DROP_INTERVAL) {
      d.weaponDropTimer = 0;
      const isMaxed = d.currentWeaponLevel >= WEAPON_LEVEL_MAX;
      const pool = isMaxed
        ? DROPPABLE_WEAPONS.filter(w => w !== d.currentWeaponId)
        : DROPPABLE_WEAPONS;
      const wid = pool[Math.floor(Math.random() * pool.length)];
      const pos = randomSpawnPos(d, 6, 4);
      d.weaponDrops.push({ id: nextId(), position: pos, weaponId: wid, bornAt: d.time });
    }
    for (let i = d.weaponDrops.length - 1; i >= 0; i--) {
      const drop = d.weaponDrops[i];
      if (d.time - drop.bornAt > WEAPON_DROP_LIFE) {
        d.weaponDrops.splice(i, 1);
        continue;
      }
      const dx = drop.position.x - d.pos.x;
      const dz = drop.position.z - d.pos.z;
      if (Math.hypot(dx, dz) < WEAPON_PICKUP_RADIUS) {
        if (drop.weaponId === d.currentWeaponId) {
          // SAME WEAPON → level up (cap at WEAPON_LEVEL_MAX).
          if (d.currentWeaponLevel < WEAPON_LEVEL_MAX) {
            d.currentWeaponLevel += 1;
          }
          d.lastWeaponPickupKind = 'levelup';
        } else {
          // DIFFERENT WEAPON → swap + reset level.
          d.currentWeaponId = drop.weaponId;
          d.currentWeaponLevel = 1;
          d.lastWeaponPickupKind = 'swap';
        }
        d.lastWeaponPickupAt = d.time;
        d.weaponDrops.splice(i, 1);
        p.playSfx('pickup_red');
        p.haptic?.('light');
      }
    }

    // ---- PERK DROP PICKUP ----
    // Walking over a power-up auto-applies the perk + sets the toast
    // window. Drops never expire — the player has the whole night to
    // grab them. Pickup radius matches the weapon drops.
    for (let i = d.perkDrops.length - 1; i >= 0; i--) {
      const drop = d.perkDrops[i];
      const dx = drop.position.x - d.pos.x;
      const dz = drop.position.z - d.pos.z;
      if (Math.hypot(dx, dz) < 1.5) {
        const perk = getPerk(drop.perkId);
        if (perk) {
          perk.apply(d);
          d.lastAppliedPerkId = perk.id;
          d.lastAppliedPerkAt = d.time;
          p.playSfx('pickup_red');
          p.haptic?.('light');
        }
        d.perkDrops.splice(i, 1);
      }
    }

    // ---- XP GEM PICKUP + MAGNET ----
    // Single pickup branch — every gem feeds XP/score. Gems within the
    // magnet radius slide toward the player so you don't have to walk
    // exactly over each one; the +magnet perk widens the radius.
    const magnetR = 3.2 * d.perkMagnetMul;
    const magnetR2 = magnetR * magnetR;
    for (let i = d.crystals.length - 1; i >= 0; i--) {
      const cr = d.crystals[i];
      const dx = d.pos.x - cr.position.x;
      const dz = d.pos.z - cr.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < magnetR2 && d2 > 0.0001) {
        const dist = Math.sqrt(d2);
        const speed = 6 + (1 - dist / magnetR) * 9;     // accelerate as it nears
        const inv = 1 / dist;
        cr.position.x += dx * inv * speed * c;
        cr.position.z += dz * inv * speed * c;
      }
      const pickDx = cr.position.x - d.pos.x;
      const pickDz = cr.position.z - d.pos.z;
      if (Math.hypot(pickDx, pickDz) < CRYSTAL_PICKUP_RADIUS) {
        d.crystals.splice(i, 1);
        d.goldCount++;
        d.score += SCORE_GOLD;
        d.xp += 1;
        d.xpInLevel += 1;
        // Level threshold reached — spawn a perk power-up on the street
        // instead of pausing the run for a modal. The drop lands next to
        // the player so they walk into it (or not) and the run keeps
        // flowing. The XP bar still tracks toward the next drop.
        if (d.xpInLevel >= d.xpNeededForLevel) {
          d.xpInLevel -= d.xpNeededForLevel;
          d.xpLevel += 1;
          d.xpNeededForLevel = 5 + d.xpLevel * 3;
          const perk = rollOnePerk();
          // Spawn a few units in a random direction so the player has to
          // step toward it — visible reward, no flow-break.
          const dropAngle = Math.random() * Math.PI * 2;
          const dropDist = 2.6 + Math.random() * 1.2;
          d.perkDrops.push({
            id: nextId(),
            position: new THREE.Vector3(
              Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, d.pos.x + Math.cos(dropAngle) * dropDist)),
              0,
              Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, d.pos.z + Math.sin(dropAngle) * dropDist)),
            ),
            perkId: perk.id,
            bornAt: d.time,
          });
        }
        p.playSfx('pickup_gold');
        emitFx(d, 'pickup_gold', cr.position.x, cr.position.z);
        p.onPickup?.('gold', SCORE_GOLD);
        p.haptic?.('light');
        p.onScore(Math.floor(d.score));
      }
    }

    // ---- CRYSTAL RESPAWN ----
    d.crystalRespawnTimer += c;
    if (d.crystalRespawnTimer >= CRYSTAL_RESPAWN_INTERVAL) {
      d.crystalRespawnTimer = 0;
      spawnCrystal(d);
    }
  });
}
