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
  getLevelTuning, LEVELS,
  AIM_RANGE, FIRE_ARC_HALF, BULLET_SPEED, BULLET_TTL, BULLET_RADIUS,
  SURGE_PERIOD, SURGE_COUNT_BASE, SURGE_COUNT_PER_NIGHT,
  MONSTER_HP, SCORE_KILL,
} from '../constants';
import type { CrystalType, LevelTuning } from '../constants';
import type { BloodSplat, Bullet, Crystal, FxEvent, Monster, MonsterTier, Pillar, PillarVariant, Stick } from '../types';
import { WEAPONS, DROPPABLE_WEAPONS } from '../builders/weapons';
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
  /** Active weapon — starts as 'pistol', changes when the player walks
   *  over a WeaponDrop. Player component watches this to swap the prop. */
  currentWeaponId: WeaponId;
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
  xpInLevel: number;       // gems collected toward the current level
  xpNeededForLevel: number;// gems needed to clear the current level
  xpLevel: number;         // current perk level (starts at 0)
  perkPending: boolean;    // flips true on level-up; UI shows the modal and
                           // the loop pauses until the player picks a card
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
    currentWeaponId: 'pistol',
    weaponDrops: [],
    weaponDropTimer: WEAPON_DROP_INTERVAL * 0.3, // first drop ~7s in
    bloodSplats: [],
    cameraShakeT: 0,
    cameraShakeMag: 0,
    xp: 0,
    xpInLevel: 0,
    xpNeededForLevel: 5,
    xpLevel: 0,
    perkPending: false,
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
// run doesn't stack 1000 splats.
const BLOOD_SPLAT_MAX = 120;
function spawnBloodSplats(d: GameRef, x: number, z: number, count: number, intensity = 1) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 3.5 * intensity;
    const isBone = Math.random() < 0.18;
    d.bloodSplats.push({
      id: nextId(),
      position: new THREE.Vector3(x, 0.85 + Math.random() * 0.5, z),
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed * (0.6 + Math.random() * 0.6),
        2.5 + Math.random() * 3.5 * intensity,
        Math.sin(angle) * speed * (0.6 + Math.random() * 0.6),
      ),
      bornAt: d.time,
      life: 0.7 + Math.random() * 0.5,
      scale: 0.05 + Math.random() * (isBone ? 0.07 : 0.10) * intensity,
      isBone,
    });
  }
  if (d.bloodSplats.length > BLOOD_SPLAT_MAX) {
    // Drop the oldest, keep the most recent which are most visible.
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
  const hp = MONSTER_HP[tier];
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
    isBoss: tier === 'boss',
  });
}

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
  for (let i = 0; i < tuning.pillarCount; i++) d.pillars.push(spawnPillar(tuning.pillarScaleBias));
  d.monsterSpawnTimer = 0;
  d.crystalRespawnTimer = 0;
  d.pos.set(0, 0, 5);
  d.rot = Math.PI;

  for (let i = 0; i < tuning.crystalInitial; i++) spawnCrystal(d);
  for (let i = 0; i < tuning.lurkerCount; i++) spawnMonsterTier(d, tuning, 'lurker');
  for (let i = 0; i < tuning.stalkerCount; i++) spawnMonsterTier(d, tuning, 'stalker');
  if (tuning.isBoss) spawnMonsterTier(d, tuning, 'boss');
}

function spawnCrystal(d: GameRef, _type?: CrystalType) {
  if (d.crystals.length >= CRYSTAL_MAX) return;
  const pos = randomSpawnPos(d, 5, 3);
  d.crystals.push({ id: nextId(), position: pos, type: 'xp' });
}

// Pillar variant weights — spikes are common (the cave-ceiling-drips look),
// domes (round boulders) less so, clusters (small stone groups) the rarest.
const PILLAR_VARIANT_WEIGHTS: { v: PillarVariant; w: number }[] = [
  { v: 'spike',   w: 5 },
  { v: 'dome',    w: 3 },
  { v: 'cluster', w: 2 },
];
function pickPillarVariant(): PillarVariant {
  const total = PILLAR_VARIANT_WEIGHTS.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of PILLAR_VARIANT_WEIGHTS) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return 'spike';
}

function spawnPillar(scaleBias: number = 1.0): Pillar {
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
    variant: pickPillarVariant(),
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
    // Perk-card modal pauses the loop — no time, no spawns, no fire.
    if (d.perkPending) return;
    const c = Math.min(delta, 0.05);
    d.time += c;
    d.levelT += c;
    const tuning = getLevelTuning(d.level);

    // ---- WAVE TIMER ----
    // Survive the full timeLimit and the night is yours. Last night clears →
    // victory; everything else just advances. The "find an exit" goal is gone:
    // you just have to outlast the swarm.
    if (d.levelT >= tuning.timeLimit) {
      const timeBonus = 0;             // no time bonus — the night was the goal
      const levelBonus = 100 * d.level;
      d.score += levelBonus + timeBonus;
      p.onScore(Math.floor(d.score));
      p.playSfx('pickup_green');       // TODO Phase 3: dedicated 'night_clear' sfx
      p.haptic?.('heavy');
      d.levelCleared = true;
      if (d.level >= LEVELS.length) d.victory = true;
      return;
    }

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
    // O(N) per pillar; N is small (~28) so this is fine.
    for (const p of d.pillars) {
      // Effective collision radius: scale * base footprint + player radius.
      // Footprints by variant — these match the renderer's bottom geometry.
      const base =
        p.variant === 'dome' ? 1.15 :
        p.variant === 'cluster' ? 0.95 :
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

      const speedK     = m.tier === 'boss' ? 0.70 : m.tier === 'stalker' ? 0.92 : 1.0;
      const telegraphK = m.tier === 'boss' ? 0.85 : m.tier === 'stalker' ? 0.92 : 1.0;
      const rangeK     = m.tier === 'boss' ? 1.10 : m.tier === 'stalker' ? 1.05 : 1.0;
      const monsterBaseSpeed = MONSTER_BASE_SPEED * tuning.monsterSpeed * speedK;
      const myTelegraph = tuning.strikeTelegraph * telegraphK;
      const myRangeMax  = tuning.strikeRangeMax  * rangeK;

      if (m.state === 'cooldown') {
        m.cooldownT -= c;
        if (dist > 0.001) {
          const n = 1 / dist;
          m.velocity.x = -dx * n * (monsterBaseSpeed * 0.35);
          m.velocity.z = -dz * n * (monsterBaseSpeed * 0.35);
        }
        if (m.cooldownT <= 0) m.state = 'lurking';
      } else if (m.state === 'lurking') {
        if (dist > MONSTER_STRIKE_RANGE_MIN + 0.4) {
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
      const w = WEAPONS[d.currentWeaponId];
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
        speedMul: WEAPONS[d.currentWeaponId].speedMul,
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
        if (b.hitIds.has(m.id)) continue;        // pierce: don't double-tap
        const bdx = b.position.x - m.position.x;
        const bdz = b.position.z - m.position.z;
        const hitR = BULLET_RADIUS + (m.tier === 'boss' ? 1.4 : 0.55);
        if (bdx * bdx + bdz * bdz < hitR * hitR) {
          m.hp -= b.dmg;
          m.hitFlashT = 0.10;
          b.hitIds.add(m.id);
          emitFx(d, 'bullet_hit', b.position.x, b.position.z);
          // Splatter — small spray for damage hits, big shower on kill below.
          spawnBloodSplats(d, b.position.x, b.position.z, 4, 0.9);
          // Knockback — push the zombie a short distance along the bullet's
          // travel direction so each shot has a visible "kah!" reaction.
          const kb = m.tier === 'boss' ? 0.10 : m.tier === 'stalker' ? 0.32 : 0.45;
          m.position.x += b.dirX * kb;
          m.position.z += b.dirZ * kb;
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
            d.kills += 1;
            d.score += SCORE_KILL[m.tier];
            p.onScore(Math.floor(d.score));
            emitFx(d, 'monster_kill', m.position.x, m.position.z);
            // Big shower on death — more chunks for boss + boss-tier shake.
            const splats = m.tier === 'boss' ? 32 : m.tier === 'stalker' ? 14 : 10;
            const intensity = m.tier === 'boss' ? 1.6 : 1.0;
            spawnBloodSplats(d, m.position.x, m.position.z, splats, intensity);
            // Only the boss kill is really felt; the rest are gentle nudges
            // so a surge of dying zombies doesn't churn the screen.
            shakeCamera(
              d,
              m.tier === 'boss' ? 0.95 : m.tier === 'stalker' ? 0.18 : 0.08,
              m.tier === 'boss' ? 0.55 : 0.10,
            );
            // Drop an XP gem where the zombie fell (capped by CRYSTAL_MAX).
            if (d.crystals.length < CRYSTAL_MAX) {
              d.crystals.push({
                id: nextId(),
                position: m.position.clone(),
                type: 'xp',
              });
            }
            d.monsters.splice(j, 1);
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
      const asStalker = Math.random() < tuning.stalkerSpawnRatio;
      spawnMonsterTier(d, tuning, asStalker ? 'stalker' : 'lurker');
    }
    d.surgeTimer += c;
    if (d.surgeTimer >= SURGE_PERIOD) {
      d.surgeTimer = 0;
      const count = SURGE_COUNT_BASE + (d.level - 1) * SURGE_COUNT_PER_NIGHT;
      for (let i = 0; i < count; i++) {
        const asStalker = Math.random() < (tuning.stalkerSpawnRatio + 0.15);
        spawnMonsterTier(d, tuning, asStalker ? 'stalker' : 'lurker');
      }
    }

    // ---- WEAPON DROPS ----
    // Spawn a fresh weapon pickup every WEAPON_DROP_INTERVAL seconds.
    // Drops linger for WEAPON_DROP_LIFE seconds, then despawn.
    d.weaponDropTimer += c;
    if (d.weaponDropTimer >= WEAPON_DROP_INTERVAL) {
      d.weaponDropTimer = 0;
      const pool = DROPPABLE_WEAPONS.filter(w => w !== d.currentWeaponId);
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
        d.currentWeaponId = drop.weaponId;
        d.weaponDrops.splice(i, 1);
        p.playSfx('pickup_red');     // satisfying upgrade chime
        p.haptic?.('light');
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
        // Level-up — surface the perk modal and pause the loop. The UI
        // observes perkPending; picking a card unblocks via setting it
        // back to false. Overflow gems roll into the next level.
        if (d.xpInLevel >= d.xpNeededForLevel) {
          d.xpInLevel -= d.xpNeededForLevel;
          d.xpLevel += 1;
          // Threshold grows arithmetically: 5, 8, 11, 14, 17, ...
          d.xpNeededForLevel = 5 + d.xpLevel * 3;
          d.perkPending = true;
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
