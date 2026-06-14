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
  AIM_RANGE, FIRE_COOLDOWN, BULLET_SPEED, BULLET_TTL, BULLET_RADIUS, BULLET_DMG,
  MONSTER_HP, SCORE_KILL,
} from '../constants';
import type { CrystalType, LevelTuning } from '../constants';
import type { Bullet, Crystal, FxEvent, Monster, MonsterTier, Pillar, PillarVariant, Stick } from '../types';

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
  fireCooldown: number;    // counts down; <=0 means ready to fire
  kills: number;           // monsters killed this run — drives score with SCORE_KILL
  muzzleFlashT: number;    // 0..0.07 fade window after each shot
  hp: number;              // hearts remaining (max 3)
  maxHp: number;
  iframesT: number;        // invulnerability window after a bite (sec)
  time: number;            // total game time (across nights) — used for cooldowns
  levelT: number;          // time elapsed within the current night
  score: number;
  goldCount: number;       // XP gems picked up
  monsterSpawnTimer: number;
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
    time: 0,
    levelT: 0,
    score: 0,
    goldCount: 0,
    monsterSpawnTimer: 0,
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
    if (p.stick.active && stickMag > 0.1) {
      const inv = 1 / Math.max(stickMag, 0.001);
      const dx = p.stick.x * inv;
      const dz = p.stick.y * inv;
      d.pos.x += dx * PLAYER_SPEED * c;
      d.pos.z += dz * PLAYER_SPEED * c;
      d.rot = Math.atan2(dx, dz);
      d.speed = PLAYER_SPEED;
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

    // ---- AUTO-FIRE (Vampire Survivors / Brotato model) ----
    // Decrement cooldown. When ready, lock the nearest monster within
    // AIM_RANGE and spawn a linear bullet aimed at its current position.
    // No tap-to-shoot — the player only controls movement.
    d.fireCooldown = Math.max(0, d.fireCooldown - c);
    d.muzzleFlashT = Math.max(0, d.muzzleFlashT - c);
    d.iframesT = Math.max(0, d.iframesT - c);
    if (d.fireCooldown <= 0 && d.monsters.length > 0) {
      let target: Monster | null = null;
      let bestD2 = AIM_RANGE * AIM_RANGE;
      for (const m of d.monsters) {
        const dxm = m.position.x - d.pos.x;
        const dzm = m.position.z - d.pos.z;
        const dd = dxm * dxm + dzm * dzm;
        if (dd < bestD2) { bestD2 = dd; target = m; }
      }
      if (target) {
        const tdx = target.position.x - d.pos.x;
        const tdz = target.position.z - d.pos.z;
        const inv = 1 / Math.max(Math.hypot(tdx, tdz), 0.001);
        const dirX = tdx * inv;
        const dirZ = tdz * inv;
        d.bullets.push({
          id: nextId(),
          position: new THREE.Vector3(d.pos.x, 0.9, d.pos.z),
          dirX,
          dirZ,
          bornAt: d.time,
          dmg: BULLET_DMG,
        });
        d.fireCooldown = FIRE_COOLDOWN;
        d.muzzleFlashT = 0.07;
        d.rot = Math.atan2(dirX, dirZ);
        emitFx(d, 'muzzle_flash', d.pos.x, d.pos.z);
        p.playSfx('shoot');
      }
    }

    // ---- BULLET UPDATE + COLLISION ----
    for (let i = d.bullets.length - 1; i >= 0; i--) {
      const b = d.bullets[i];
      b.position.x += b.dirX * BULLET_SPEED * c;
      b.position.z += b.dirZ * BULLET_SPEED * c;
      if (d.time - b.bornAt > BULLET_TTL
          || Math.abs(b.position.x) > ARENA_HALF
          || Math.abs(b.position.z) > ARENA_HALF) {
        d.bullets.splice(i, 1);
        continue;
      }
      for (let j = d.monsters.length - 1; j >= 0; j--) {
        const m = d.monsters[j];
        const bdx = b.position.x - m.position.x;
        const bdz = b.position.z - m.position.z;
        const hitR = BULLET_RADIUS + (m.tier === 'boss' ? 1.4 : 0.55);
        if (bdx * bdx + bdz * bdz < hitR * hitR) {
          m.hp -= b.dmg;
          m.hitFlashT = 0.10;
          emitFx(d, 'bullet_hit', b.position.x, b.position.z);
          d.bullets.splice(i, 1);
          if (m.hp <= 0) {
            d.kills += 1;
            d.score += SCORE_KILL[m.tier];
            p.onScore(Math.floor(d.score));
            emitFx(d, 'monster_kill', m.position.x, m.position.z);
            // Drop an XP gem where the zombie fell (capped by CRYSTAL_MAX).
            if (d.crystals.length < CRYSTAL_MAX) {
              d.crystals.push({
                id: nextId(),
                position: m.position.clone(),
                type: 'xp',
              });
            }
            d.monsters.splice(j, 1);
            p.playSfx('kill');
            p.haptic?.(m.tier === 'boss' ? 'heavy' : 'light');
          }
          break;
        }
      }
    }

    // ---- MONSTERS — decay hit flash ----
    for (const m of d.monsters) {
      if (m.hitFlashT > 0) m.hitFlashT = Math.max(0, m.hitFlashT - c);
    }

    // ---- MONSTER SPAWN OVER TIME ----
    // Respawn type follows the level's stalkerSpawnRatio so the mix
    // gradually shifts toward more lurkers being killed (off-screen) and
    // replaced — preserving the lurker-as-fodder dynamic the player has
    // earned by upgrading their blockParty.
    d.monsterSpawnTimer += c;
    if (d.monsterSpawnTimer >= tuning.monsterSpawnInterval) {
      d.monsterSpawnTimer = 0;
      const asStalker = Math.random() < tuning.stalkerSpawnRatio;
      spawnMonsterTier(d, tuning, asStalker ? 'stalker' : 'lurker');
    }

    // ---- XP GEM PICKUP ----
    // Single pickup branch — every gem gives the same XP/score. The
    // crystal-color light mechanics from Lantern are gone.
    for (let i = d.crystals.length - 1; i >= 0; i--) {
      const cr = d.crystals[i];
      const dx = cr.position.x - d.pos.x;
      const dz = cr.position.z - d.pos.z;
      if (Math.hypot(dx, dz) < CRYSTAL_PICKUP_RADIUS) {
        d.crystals.splice(i, 1);
        d.goldCount++;
        d.score += SCORE_GOLD;
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
