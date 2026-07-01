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
  pickBossKinds,
  MONSTER_HP, SCORE_KILL,
  normalizeBossLoadout,
} from '../constants';
import type { BossBehavior, BossKind, BossLoadout } from '../constants';
import type { CrystalType, LevelTuning } from '../constants';
import type { BloodSplat, Bullet, Crystal, EnemyProjectile, ExitStone, FxEvent, Monster, MonsterTier, PerkDrop, Pillar, PillarVariant, Stick } from '../types';
import { getPerk, rollOnePerk } from '../perks';
import { DROPPABLE_WEAPONS, weaponEffectiveSpec, WEAPON_LEVEL_MAX } from '../builders/weapons';
import type { WeaponId } from '../builders/weapons';
import { CARTRIDGE } from '../cartridge';
import type { HeroId } from '../cartridge';

const WEAPON_DROP_INTERVAL = 11;     // 2026-06-16 v2 — 16→11s between drops, weapon-level-up should be near-continuous now
const WEAPON_DROP_LIFE = 36;         // 30→36s — three drops can overlap on the ground waiting for the player
const WEAPON_PICKUP_RADIUS = 2.0;    // 1.9→2.0 — fully generous walk-over hitbox

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
  /** Set every time a hit strips a weapon level (weapon-as-armor model).
   *  Polled by BlockParty.tsx to fire a red "WEAPON WEAKENED" toast. */
  lastWeaponDowngradeAt: number;
  /** Snapshot of the weapon state right after the downgrade — used by
   *  the toast to show e.g. "MAGNUM ★★★··" so the player sees exactly
   *  what they have left, not what they lost. */
  lastWeaponDowngradeId: WeaponId | null;
  lastWeaponDowngradeLevel: number;
  weaponDrops: { id: number; position: THREE.Vector3; weaponId: WeaponId; bornAt: number }[];
  weaponDropTimer: number;
  bloodSplats: BloodSplat[];
  /** Camera shake — decays from 1 over the next `cameraShakeT` seconds.
   *  Bullet hits bump it small (0.08s), player damage bumps it heavy
   *  (0.30s), boss kill bumps it huge (0.55s). */
  cameraShakeT: number;
  cameraShakeMag: number;

  // ─── anti-stall (elite spawner) ────────────────────────────────────
  // Once the level has been running long enough, periodically spawn an
  // elite ranged stalker so the player can't camp early levels for
  // free XP. Set per-level; reset on startLevel.
  elitesSpawnedThisLevel: number;
  lastEliteSpawnT: number;        // d.levelT at the most recent elite spawn
  /** Set by spawnEliteStalker, polled + cleared by BlockParty.tsx for the
   *  "ELITE INCOMING" warning toast. Holds the spawn timestamp. */
  lastEliteAlertAt: number;
  /** Boss kinds the player has defeated this run. Each one unlocks the
   *  corresponding ambient elite spawn from AMBIENT_ELITE_UNLOCK_LEVEL+.
   *  Persists across levels in a run; reset on createGameState (fresh run). */
  defeatedBossKinds: Set<BossKind>;
  /** Continuous time (seconds) the player has been tucked in a corner of
   *  the arena. Used to detect + punish corner-camping (free-fire from a
   *  90° safe zone). Resets toward 0 when the player moves out. */
  cornerCampT: number;

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
    lastWeaponDowngradeAt: 0,
    lastWeaponDowngradeId: null,
    lastWeaponDowngradeLevel: 1,
    weaponDrops: [],
    weaponDropTimer: WEAPON_DROP_INTERVAL * 0.3, // first drop ~7s in
    bloodSplats: [],
    cameraShakeT: 0,
    cameraShakeMag: 0,
    elitesSpawnedThisLevel: 0,
    lastEliteSpawnT: 0,
    lastEliteAlertAt: 0,
    defeatedBossKinds: new Set<BossKind>(),
    cornerCampT: 0,
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
function rollDebrisKind(isBone: boolean) {
  if (CARTRIDGE.visuals?.debrisStyle !== 'household') return isBone ? 'bone' : 'blood';
  const r = Math.random();
  if (r < 0.36) return 'dust';
  if (r < 0.62) return 'fur';
  if (r < 0.84) return 'spark';
  return 'confetti';
}

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
    const kind = rollDebrisKind(isBone);
    d.bloodSplats.push({
      id: nextId(),
      position: new THREE.Vector3(x, 0.85 + Math.random() * 0.6, z),
      velocity: new THREE.Vector3(
        Math.sin(angle) * baseSpeed * lateral,
        4 + Math.random() * 4 * intensity,                   // higher arc
        Math.cos(angle) * baseSpeed * lateral,
      ),
      bornAt: d.time,
      life: CARTRIDGE.visuals?.debrisStyle === 'household' ? 0.75 + Math.random() * 0.65 : 1.0 + Math.random() * 0.8,
      scale: 0.08 + Math.random() * (isBone ? 0.10 : 0.16) * intensity,
      isBone,
      kind,
    });
  }
  if (d.bloodSplats.length > BLOOD_SPLAT_MAX) {
    d.bloodSplats.splice(0, d.bloodSplats.length - BLOOD_SPLAT_MAX);
  }
}

// Damage every monster strike does to the player. L1-7 stays at 1 (the
// hand-tuned "3 hits to die" loop). At L8+ each bite/spit/blast costs
// 2 hp — player has 3 hp, so they get exactly ONE clean hit before
// they're one mistake from dead. The fundamental "I have to dodge"
// shift that nothing else really delivers.
function strikePlayerDamage(level: number): number {
  return level >= 8 ? 2 : 1;
}

// ─── Weapon-as-armor — late-game equalizer ─────────────────────────────
// Every successful monster strike eats one level off the player's current
// weapon BEFORE it touches hp. Only after the weapon has been fully
// stripped back to baseline pistol do further hits start draining
// hp on the normal strikePlayerDamage curve.
//
// L13 with a lvl-5 magnum + 3 hp → can absorb 5 hits as armor (lvl 5 → 4
// → 3 → 2 → 1 → pistol) + 1 hit on hp before being one mistake from
// dead. But each absorbed hit costs the player DPS, so the swarm gets
// progressively harder to clear — doom-spiral late-game pressure.
//
// Returns true if the hit was absorbed by the weapon (caller can skip
// playing the heavy hp-damage feedback), false if it dropped hp.
function applyPlayerHit(d: GameRef): boolean {
  // Weapon has levels to lose — strip one and call it absorbed.
  if (d.currentWeaponId !== 'pistol' && d.currentWeaponLevel > 1) {
    d.currentWeaponLevel -= 1;
    d.lastWeaponDowngradeAt = d.time;
    d.lastWeaponDowngradeId = d.currentWeaponId;
    d.lastWeaponDowngradeLevel = d.currentWeaponLevel;
    return true;
  }
  // Weapon is at lvl 1 of a non-pistol — the final armor layer is the
  // weapon itself; revert to pistol baseline and absorb the hit.
  if (d.currentWeaponId !== 'pistol') {
    d.currentWeaponId = 'pistol';
    d.currentWeaponLevel = 1;
    d.lastWeaponDowngradeAt = d.time;
    d.lastWeaponDowngradeId = 'pistol';
    d.lastWeaponDowngradeLevel = 1;
    return true;
  }
  // No armor left — the strike costs hp on the normal curve.
  d.hp -= strikePlayerDamage(d.level);
  return false;
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

function skillKindForBoss(kind: BossBehavior): NonNullable<Monster['skill']>['kind'] {
  return kind === 'minotaur'    ? 'charge'
    : kind === 'punk'           ? 'pounce'
    : kind === 'mech'           ? 'beam'
    : kind === 'viking'         ? 'shield'
    : kind === 'swat'           ? 'shield'
    : kind === 'cop'            ? 'summon'
    : kind === 'cowboy'         ? 'burstfire'
    : kind === 'goth'           ? 'blink'
    : kind === 'biker'          ? 'flank'
    : kind === 'firefighter'    ? 'rage'
    :                             'shield';
}

function spawnMonsterTier(d: GameRef, tuning: LevelTuning, tier: MonsterTier, explicitBoss?: BossKind | BossLoadout) {
  if (d.monsters.length >= tuning.monsterMax) return;
  const minDist = tier === 'boss' ? 18 : 14;
  const pos = randomSpawnPos(d, minDist, 2);
  let hp = MONSTER_HP[tier];
  let scaleMul: number | undefined;
  let bossKind: BossBehavior | undefined;
  let bossSkin: BossKind | undefined;
  let skill: Monster['skill'];
  if (tier === 'boss') {
    // 2026-06-16 v4 strengthen — bump slope 0.12→0.15 and cap 6.5×→8×
    // (full revert to the original "too steep" curve; the beam dodge
    // fix + the player's compounding weapon DPS now make this fair).
    //   L1=32, L5=51, L10=80, L15=109, L20=141, L48+=256 (cap).
    hp = Math.min(MONSTER_HP.boss * 8, Math.round(MONSTER_HP.boss * (1 + (tuning.level - 1) * 0.15)));
    // 2026-06-16 v4 — scaleMul floor 1.4→1.5 and cap 1.6→1.75 so bosses
    // read visibly larger by default (more menacing silhouette, slightly
    // bigger contact box via m.scaleMul). Same-kind ambient elites stay
    // at 1.0× so the "boss vs elite at a glance" contract holds.
    scaleMul = Math.min(1.75, 1.5 + Math.floor((tuning.level - 1) / 3) * 0.05);
    // Boss variant — caller (startLevel) passes the kind via
    // pickBossKinds(). Fallback for safety = vampire (the L1 boss).
    const loadout = normalizeBossLoadout(explicitBoss);
    bossKind = loadout.behavior;
    bossSkin = loadout.skin;
    if (bossKind !== 'vampire') {
      // Skill family per kind:
      //   minotaur / punk      → charge
      //   mech                 → beam
      //   viking / swat        → shield
      //   cop                  → summon  (calls 2 lurkers)
      //   cowboy               → burstfire (3 revolver shots)
      //   goth                 → blink   (teleport behind player)
      //   biker                → flank   (passive perpendicular orbit)
      //   firefighter          → rage    (speed boost + KB immune)
      const skillKind = skillKindForBoss(bossKind);
      skill = {
        kind: skillKind,
        phase: 'idle',
        phaseT: 0,
        cooldownT: 2 + Math.random() * 1.5,  // v4 first skill 3-5 → 2-3.5s (bosses open with their move sooner)
        aimX: 0,
        aimZ: 0,
      };
    }
  } else {
    // 2026-06-16 v3 midpoint — slope 0.22→0.28, cap 6×→8× (halfway
    // between the prior 0.35/10× and the over-flat 0.22/6×).
    //   L4=1.28×, L8=2.40×, L12=3.52×, L15=4.36×, L20=5.76×, L29+=8×.
    if (tuning.level > 3) {
      const scale = Math.min(8.0, 1 + (tuning.level - 3) * 0.28);
      hp = Math.round(hp * scale);
    }
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
    scaleMul,
    bossKind,
    bossSkin,
    skill,
  });
}

// ─── Anti-stall elite spawner ─────────────────────────────────────────
// When a level overstays its welcome (player camping for free XP), spawn
// an enhanced stalker every ELITE_INTERVAL seconds with 2× HP + a 50%
// faster projectile. Caps at MAX_ELITES_PER_LEVEL so the player isn't
// punished infinitely, but enough pressure to push them toward the exit.
const LEVEL_STALL_THRESHOLD = 70.0;   // seconds before the first elite spawns
const ELITE_INTERVAL = 18.0;          // gap between subsequent elites
const MAX_ELITES_PER_LEVEL = 4;
function spawnEliteStalker(d: GameRef, tuning: LevelTuning) {
  if (d.monsters.length >= tuning.monsterMax) return;
  const pos = randomSpawnPos(d, 16, 2);
  // Base 2× HP + the same per-level scaling as the main formula
  // (pass 4 slope 0.35 / cap 10×).
  let hp = MONSTER_HP.stalker * 2;
  if (tuning.level > 3) {
    const scale = Math.min(8.0, 1 + (tuning.level - 3) * 0.28);
    hp = Math.round(hp * scale);
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
    tier: 'stalker',
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
    isBoss: false,
    isElite: true,
  });
  d.elitesSpawnedThisLevel += 1;
  d.lastEliteSpawnT = d.levelT;
  d.lastEliteAlertAt = d.time;
}

// ─── Ambient elite (defeated-boss kinds as occasional small enemies) ─
// Once the player has killed a minotaur/mech/swat boss for the first
// time, that kind unlocks. From AMBIENT_ELITE_UNLOCK_LEVEL onward,
// each spawn-trickle tick has a small chance to spawn one of the
// unlocked kinds as an ambient elite — wraps an appropriate base tier
// (brute for minotaur / stalker for mech / lurker for swat) at ~3-4×
// regular HP. Keeps the bossKind + skill state machine so the player
// still has to deal with charge / beam / shield in non-boss levels.
const AMBIENT_ELITE_UNLOCK_LEVEL = 11;   // post-unlock-ladder (Batch B: L1-10 intro)
const AMBIENT_ELITE_BASE_CHANCE = 0.06;   // ~6% of trickle spawns at L11+
function spawnAmbientElite(d: GameRef, tuning: LevelTuning, kind: BossKind) {
  if (d.monsters.length >= tuning.monsterMax) return;
  if (kind === 'vampire') return;   // no ambient vampires (boss-only)
  // Pick a wrapper tier per kind so the base AI (movement / range / SFX)
  // fits the silhouette.
  //   minotaur    → brute   (slow tough heavy melee)
  //   mech        → stalker (ranged)
  //   viking      → lurker  (walking shield melee)
  //   punk        → runner  (fast melee — matches the rabid-pounce read)
  //   swat        → lurker  (legacy)
  //   cop         → lurker  (regular guy who summons more)
  //   cowboy      → stalker (ranged revolver shots)
  //   goth        → ghost   (phaser feel for blink)
  //   biker       → runner  (fast — flanks the player)
  //   firefighter → brute   (tough — rages forward)
  const tier: MonsterTier =
    kind === 'minotaur'    ? 'brute'
    : kind === 'mech'      ? 'stalker'
    : kind === 'punk'      ? 'runner'
    : kind === 'cowboy'    ? 'stalker'
    : kind === 'goth'      ? 'ghost'
    : kind === 'biker'     ? 'runner'
    : kind === 'firefighter' ? 'brute'
    :                        'lurker';  // viking + swat + cop
  const skillKind = skillKindForBoss(kind);
  const pos = randomSpawnPos(d, 14, 2);
  // 3× tier baseline HP — meaty for an ambient, but well below boss
  // (boss = 14× at L15). Same per-level scaling as everyone else.
  let hp = MONSTER_HP[tier] * 3;
  if (tuning.level > 3) {
    const scale = Math.min(8.0, 1 + (tuning.level - 3) * 0.28);
    hp = Math.round(hp * scale);
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
    isBoss: false,
    isElite: true,
    // Batch C — ambient elite spawns at NORMAL size (1.0×). The boss
    // ring + emissive ring still flag this as elite; the silhouette
    // size is reserved for the actual boss (≥1.4×) so the two are
    // immediately distinguishable on the battlefield.
    scaleMul: 1.0,
    bossKind: kind,
    bossSkin: kind,
    skill: {
      kind: skillKind,
      phase: 'idle',
      phaseT: 0,
      cooldownT: 6 + Math.random() * 3,   // longer warmup than boss skills
      aimX: 0,
      aimZ: 0,
    },
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

// Pick an EXIT spawn position: far from the player, away from edges,
// and CLEAR of any pillar (no spawning inside a wrecked truck etc.).
// We rate each candidate (60 attempts) and accept the first one that's
// far enough AND not overlapping any solid pillar. Failing that, the
// best clear-of-pillars candidate found wins; final fallback is the
// opposite-of-player position with a small lateral nudge.
function pickExitSpawn(d: GameRef): THREE.Vector3 {
  // Clearance margin = EXIT_PICKUP_RADIUS + slack so the beacon glow
  // doesn't poke into geometry even if the center barely clears.
  const CLEARANCE_PAD = EXIT_PICKUP_RADIUS + 0.6;
  const isClear = (x: number, z: number) => {
    for (const p of d.pillars) {
      // Skip walkable variants — players can already stand on them.
      if (p.variant === 'steamGrate' || p.variant === 'bodyBag') continue;
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
      const r = base * p.scale + CLEARANCE_PAD;
      const ddx = x - p.position.x;
      const ddz = z - p.position.z;
      if (ddx * ddx + ddz * ddz < r * r) return false;
    }
    return true;
  };
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * (PLAYFIELD - 6);
    const z = (Math.random() - 0.5) * (PLAYFIELD - 6);
    if (Math.hypot(x - d.pos.x, z - d.pos.z) < EXIT_MIN_DIST) continue;
    if (isClear(x, z)) return new THREE.Vector3(x, 0, z);
  }
  // Fallback: opposite of player, but if that also collides, sweep
  // outward in a small radius until we find a clear spot.
  const fx = -d.pos.x * 0.8, fz = -d.pos.z * 0.8;
  if (isClear(fx, fz)) return new THREE.Vector3(fx, 0, fz);
  for (let r = 1.5; r <= 8; r += 1.5) {
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4;
      const x = fx + Math.cos(ang) * r;
      const z = fz + Math.sin(ang) * r;
      if (Math.abs(x) < ARENA_HALF - 2 && Math.abs(z) < ARENA_HALF - 2 && isClear(x, z)) {
        return new THREE.Vector3(x, 0, z);
      }
    }
  }
  // Truly stuck — return the fallback even if it overlaps. Better than
  // a permanently unreachable level.
  return new THREE.Vector3(fx, 0, fz);
}

function summonExit(d: GameRef, atPos?: THREE.Vector3) {
  if (d.exit) return;
  // If the caller passed a kill position (boss death), validate it
  // doesn't overlap a pillar — monsters don't collide with pillars so
  // a boss can die inside a wrecked truck and the naive exit-here
  // placement would be unreachable. Fall back to pickExitSpawn() in
  // that case, which does proper clearance checking.
  let pos: THREE.Vector3;
  if (atPos) {
    const CLEARANCE_PAD = EXIT_PICKUP_RADIUS + 0.6;
    let overlaps = false;
    for (const p of d.pillars) {
      if (p.variant === 'steamGrate' || p.variant === 'bodyBag') continue;
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
      const r = base * p.scale + CLEARANCE_PAD;
      const ddx = atPos.x - p.position.x;
      const ddz = atPos.z - p.position.z;
      if (ddx * ddx + ddz * ddz < r * r) { overlaps = true; break; }
    }
    pos = overlaps ? pickExitSpawn(d) : atPos.clone();
  } else {
    pos = pickExitSpawn(d);
  }
  d.exit = { position: pos, bornAt: d.time };
  d.exitJustOpened = true;
}

// Called after every kill credit. On boss nights, the exit only spawns
// when ALL bosses are dead (multi-boss nights ship 2-6 bosses depending
// on cycle). On non-boss nights the kill goal opens the exit.
function checkExitTrigger(d: GameRef, killedTier: MonsterTier, killPos: THREE.Vector3) {
  if (d.exit) return;
  if (killedTier === 'boss') {
    // Are any bosses still standing? Filter by `hp > 0` — the just-
    // killed boss already has `hp <= 0` at this point (m.dying is
    // not flagged true until AFTER this function returns, so we
    // can't use !m.dying as the filter). hp > 0 reliably excludes
    // both the just-killed boss AND any already-dying corpses.
    // Latent bug from 5e4a089: was `!m.dying` which counted the
    // just-killed boss as alive — every single-boss level (L1-10
    // after Batch B) became uncompletable.
    const bossesAlive = d.monsters.filter(m => m.tier === 'boss' && m.hp > 0).length;
    if (bossesAlive > 0) return;          // more bosses to clear before exit
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
  d.elitesSpawnedThisLevel = 0;
  d.lastEliteSpawnT = 0;
  d.lastEliteAlertAt = 0;
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
  if (tuning.isBoss) {
    // Multi-boss spawn — tutorial-schedule via pickBossKinds (cycle 2
    // introduces minotaur, cycle 3 adds mech + revisits minotaur, …).
    // All bosses must be killed before the exit beacon spawns
    // (see checkExitTrigger).
    const kinds = pickBossKinds(level);
    for (const kind of kinds) spawnMonsterTier(d, tuning, 'boss', kind);
  }
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
  survivor: HeroId;
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

      // ── BOSS SKILL STATE MACHINES ───────────────────────────────────
      // Each boss variant carries a unique signature ability. The
      // state machine is independent of the default AI: when a skill
      // is in an "override" phase (charge dash, beam fire) we run the
      // skill code and `continue` past the regular AI. Shield is the
      // exception — it stays still but lets the SWAT keep walking.
      if (m.skill) {
        const sk = m.skill;
        if (sk.kind === 'charge') {
          // MINOTAUR CHARGE — heavy line dash: 0.7s telegraph (ground-
          // line aimed at player) → 12 u/s × 1.2s dash along locked
          // aim → 1.4s stun. (Punk used to share this case as a
          // faster variant; it now runs the `pounce` skill below.)
          const TELEGRAPH_T = 0.70;
          const DASH_SPEED  = 13;        // v4 +8% — slightly harder to outrun
          const DASH_DUR    = 1.20;
          const STUN_T      = 1.10;      // v4 stun 1.4→1.1 — gets back into the fight faster
          const NEXT_CD_MIN = 3.0;       // v4 4.0→3.0
          const NEXT_CD_RND = 2.0;
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 3.5 && dist < 18) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              // Face player during telegraph.
              if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            // Face-lock toward player throughout the windup so the
            // ground-line telegraph aims where the dash will go.
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= TELEGRAPH_T) {
              // LOCK aim, transition to dash. From here on the
              // direction is fixed — player can step out of the line.
              const inv = dist > 0.001 ? 1 / dist : 0;
              sk.aimX = dx * inv;
              sk.aimZ = dz * inv;
              sk.phase = 'active';
              sk.phaseT = 0;
            }
            // Idle in place during windup (no chase).
            m.velocity.x *= 0.8; m.velocity.z *= 0.8;
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            m.position.x += sk.aimX * DASH_SPEED * c;
            m.position.z += sk.aimZ * DASH_SPEED * c;
            m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
            m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
            // Contact damage along the dash path.
            const cdx = d.pos.x - m.position.x;
            const cdz = d.pos.z - m.position.z;
            const cdist = Math.hypot(cdx, cdz);
            const hitR = (m.scaleMul ?? 1) * 1.4;
            if (cdist < hitR && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
              applyPlayerHit(d);
              d.iframesT = 1.2;
              shakeCamera(d, 0.95, 0.36);
              emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
              p.playSfx('strike_hit');
              p.haptic?.('heavy');
              p.onStrikeHit?.();
              // Knockback player off the charge line.
              const kbInv = cdist > 0.001 ? 1 / cdist : 0;
              const kbMag = 4.5;
              d.cameraShakeMag = 1.1;
              d.cameraShakeT = 0.40;
              // Use velocity knock — player pos cannot be set directly
              // here, but iframes + shake sells the hit.
              // Stop the dash on hit (no infinite penetration).
              sk.phase = 'recover';
              sk.phaseT = 0;
              // Slow the rest of the dash distance — feels like the
              // charge "buried" into the player.
              sk.aimX *= 0; sk.aimZ *= 0;
              void kbInv; void kbMag;
            } else if (sk.phaseT >= DASH_DUR) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover (stun)
            sk.phaseT += c;
            m.velocity.x *= 0.8; m.velocity.z *= 0.8;
            if (sk.phaseT >= STUN_T) {
              sk.phase = 'idle';
              sk.cooldownT = NEXT_CD_MIN + Math.random() * NEXT_CD_RND;
            }
            continue;
          }
        } else if (sk.kind === 'beam') {
          // COMBAT MECH BEAM — 2026-06-16 redesign for dodgeability:
          //   * 1.5s telegraph (was 1.8s) and aim LOCKS at 0.25s instead of
          //     tracking the player to the end. Player can side-step OUT of
          //     the line during the full remaining 1.25s.
          //   * Hit corridor narrowed 0.9 → 0.55 — the laser is THIN.
          //   * Recover bumped 0.6 → 1.0s; cooldown 3.5-5.5 → 5-7s so the
          //     beam isn't back-to-back.
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 5 && dist < 24) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              // Pre-lock the initial aim toward current player position so
              // the visible beam line snaps in immediately (not at the end).
              const inv = dist > 0.001 ? 1 / dist : 0;
              sk.aimX = dx * inv;
              sk.aimZ = dz * inv;
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            // Aim tracks ONLY for the first 0.25s (acquisition window),
            // then HARD-LOCKS for the rest of the telegraph. Player has
            // ~1.25s to step out of the line.
            if (sk.phaseT < 0.25) {
              const inv = dist > 0.001 ? 1 / dist : 0;
              sk.aimX = dx * inv;
              sk.aimZ = dz * inv;
            }
            // Don't move during charge — feet planted, glow ramping.
            m.velocity.x *= 0.5; m.velocity.z *= 0.5;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 1.5) {
              sk.phase = 'active';
              sk.phaseT = 0;
            }
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            // Hitscan check — does the beam line pass through player?
            // Compute perpendicular distance from player to the ray
            // starting at mech, direction (aimX, aimZ).
            const px = d.pos.x - m.position.x;
            const pz = d.pos.z - m.position.z;
            const along = px * sk.aimX + pz * sk.aimZ;          // forward
            const perpX = px - sk.aimX * along;
            const perpZ = pz - sk.aimZ * along;
            const perpDist = Math.hypot(perpX, perpZ);
            // 2026-06-16 v3 — hit corridor 0.55→0.70 (halfway back from
            // the original 0.9). Still readably thin but less "I dodged
            // and got hit anyway" feel.
            if (along > 0 && perpDist < 0.70 && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
              applyPlayerHit(d);
              d.iframesT = 1.2;
              shakeCamera(d, 0.90, 0.32);
              emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
              p.playSfx('strike_hit');
              p.haptic?.('heavy');
              p.onStrikeHit?.();
            }
            if (sk.phaseT >= 0.4) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            // v4 — beam cooldown 4-6 → 3-5s (boss strengthen pass).
            if (sk.phaseT >= 0.8) {
              sk.phase = 'idle';
              sk.cooldownT = 3 + Math.random() * 2;
            }
            // Still no movement during recovery cooldown — readable break.
            m.velocity.x *= 0.4; m.velocity.z *= 0.4;
            continue;
          }
        } else if (sk.kind === 'shield') {
          // SWAT SHIELD — periodic 2.5s shield-up window where frontal
          // bullets are absorbed. Movement is NOT overridden so the
          // SWAT keeps walking; the shield effect is enforced in the
          // bullet-hit code via skill.phase === 'active'.
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 1.5 && dist < 22) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            if (sk.phaseT >= 0.3) {
              sk.phase = 'active';
              sk.phaseT = 0;
            }
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            // Face the player so the shield faces incoming fire.
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 2.5) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
          } else {  // recover (lowering)
            sk.phaseT += c;
            if (sk.phaseT >= 0.4) {
              sk.phase = 'idle';
              sk.cooldownT = 2.5 + Math.random() * 1.5;     // v4 shield 3.5-5 → 2.5-4
            }
          }
          // Fall through to regular boss/melee AI for movement.
        } else if (sk.kind === 'summon') {
          // COP SUMMON — 0.6s whistle telegraph → spawn 2 lurkers at
          // ~3u around the cop. 7-10s cooldown. Cop holds position
          // during windup, then keeps walking after recover.
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 3 && dist < 22) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            m.velocity.x *= 0.6; m.velocity.z *= 0.6;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 0.6) {
              // Spawn 2 lurker minions near the cop.
              for (let s = 0; s < 2; s++) {
                if (d.monsters.length >= tuning.monsterMax) break;
                const ang = Math.random() * Math.PI * 2;
                const r = 2.2 + Math.random() * 0.8;
                const sx = m.position.x + Math.cos(ang) * r;
                const sz = m.position.z + Math.sin(ang) * r;
                const px = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, sx));
                const pz = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, sz));
                let mHp = MONSTER_HP.lurker;
                if (tuning.level > 3) mHp = Math.round(mHp * Math.min(8, 1 + (tuning.level - 3) * 0.28));
                d.monsters.push({
                  id: nextId(),
                  position: new THREE.Vector3(px, 0, pz),
                  velocity: new THREE.Vector3(),
                  rotation: Math.atan2(d.pos.x - px, d.pos.z - pz),
                  state: 'lurking',
                  fleeT: 0, cooldownT: 0, strikeT: 0,
                  strikeAimX: 0, strikeAimZ: 0,
                  tier: 'lurker',
                  hp: mHp, maxHp: mHp,
                  hitFlashT: 0,
                  knockbackVX: 0, knockbackVZ: 0, knockbackT: 0,
                  dying: false, dyingT: 0,
                  flightVX: 0, flightVZ: 0, flightSpin: 0,
                  deathStyle: 0, deathArc: 0,
                  isBoss: false,
                });
              }
              p.playSfx('strike_hit');
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.7; m.velocity.z *= 0.7;
            if (sk.phaseT >= 0.5) {
              sk.phase = 'idle';
              sk.cooldownT = 5 + Math.random() * 3;     // v4 summon 7-10 → 5-8
            }
            continue;
          }
        } else if (sk.kind === 'burstfire') {
          // COWBOY BURSTFIRE — 0.5s raise-revolver telegraph → 3
          // projectiles, 0.18s apart, each re-aimed at the player's
          // current position. 4-7s cooldown. Cowboy plants during the
          // burst (no walking) so the shots are predictable to dodge.
          const BURST_GAP = 0.18;
          const BURST_COUNT = 3;
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 5 && dist < 22) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            m.velocity.x *= 0.5; m.velocity.z *= 0.5;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 0.5) {
              sk.phase = 'active';
              sk.phaseT = 0;
              // Use aimX as the "next-shot timer" carrier (re-purposed
              // since burstfire re-aims per shot).
              sk.aimX = 0;     // next-shot timer
              sk.aimZ = 0;     // shots-fired counter
            }
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            m.velocity.x *= 0.4; m.velocity.z *= 0.4;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            sk.aimX -= c;
            if (sk.aimX <= 0 && sk.aimZ < BURST_COUNT) {
              // Fire one projectile aimed at the player NOW.
              const inv = dist > 0.001 ? 1 / dist : 0;
              d.enemyProjectiles.push({
                id: nextId(),
                position: new THREE.Vector3(m.position.x, 1.1, m.position.z),
                dirX: dx * inv,
                dirZ: dz * inv,
                bornAt: d.time,
                ttl: PROJECTILE_TTL,
                speedMul: 1.8,   // revolver rounds fly fast
              });
              p.playSfx('strike_hit');
              sk.aimX = BURST_GAP;
              sk.aimZ += 1;
            }
            if (sk.aimZ >= BURST_COUNT) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.6; m.velocity.z *= 0.6;
            if (sk.phaseT >= 0.4) {
              sk.phase = 'idle';
              sk.cooldownT = 3 + Math.random() * 2;     // v4 burstfire 4-7 → 3-5
            }
            continue;
          }
        } else if (sk.kind === 'blink') {
          // GOTH BLINK — 0.4s purple swirl at the goth → teleport to
          // a point ~3u behind the player → 0.3s recover. The body
          // is invulnerable / unhittable during the blink window
          // (we just skip the regular AI and stay put visually until
          // the warp lands). 5-9s cooldown.
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 4 && dist < 18) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            m.velocity.x = 0; m.velocity.z = 0;
            if (sk.phaseT >= 0.4) {
              // Teleport to behind the player. "Behind" = opposite of
              // player's facing (d.rot points along (sin(rot), cos(rot))).
              const facingX = Math.sin(d.rot);
              const facingZ = Math.cos(d.rot);
              const tx = d.pos.x - facingX * 3.0;
              const tz = d.pos.z - facingZ * 3.0;
              m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, tx));
              m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, tz));
              // Face the player from the new position.
              const ndx = d.pos.x - m.position.x;
              const ndz = d.pos.z - m.position.z;
              if (Math.hypot(ndx, ndz) > 0.001) m.rotation = Math.atan2(ndx, ndz);
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_hit');
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else if (sk.phase === 'active') {
            // No active phase used — telegraph jumps straight to recover.
            sk.phase = 'recover';
            sk.phaseT = 0;
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.6; m.velocity.z *= 0.6;
            if (sk.phaseT >= 0.3) {
              sk.phase = 'idle';
              sk.cooldownT = 4 + Math.random() * 3;     // v4 blink 5-9 → 4-7
            }
            continue;
          }
        } else if (sk.kind === 'flank') {
          // BIKER FLANK — passive perpendicular orbit. While idle the
          // biker walks TANGENT to the player (sidesteps), with a
          // brief "lunge" sprint at the player on cooldown. Lunges
          // are visible: 0.3s telegraph (face-lock) → 0.7s sprint at
          // 1.5× → 0.5s recover.
          if (sk.phase === 'idle') {
            // Tangent override — biker circles the player rather than
            // walking straight in. Pick CW or CCW based on monster id
            // parity so a group of bikers visibly fans both ways.
            const sign = (m.id & 1) ? 1 : -1;
            if (dist > 0.001) {
              const inv = 1 / dist;
              const tx = -dz * inv * sign;     // tangent (90° rotation)
              const tz =  dx * inv * sign;
              // Mix toward player so they don't orbit at constant radius
              // — slow drift in.
              const drift = 0.20;
              m.velocity.x = (tx * (1 - drift) + dx * inv * drift) * monsterBaseSpeed * 1.05;
              m.velocity.z = (tz * (1 - drift) + dz * inv * drift) * monsterBaseSpeed * 1.05;
            }
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 3 && dist < 16) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
            // Move now then continue past regular AI.
            m.position.x += m.velocity.x * c;
            m.position.z += m.velocity.z * c;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
            m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
            continue;
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            m.velocity.x *= 0.5; m.velocity.z *= 0.5;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 0.3) {
              sk.phase = 'active';
              sk.phaseT = 0;
              const inv = dist > 0.001 ? 1 / dist : 0;
              sk.aimX = dx * inv;
              sk.aimZ = dz * inv;
            }
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            // Sprint along locked aim at 1.5× speed.
            const sprintS = monsterBaseSpeed * 1.5;
            m.position.x += sk.aimX * sprintS * c;
            m.position.z += sk.aimZ * sprintS * c;
            m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
            m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
            // Contact damage.
            const cdx = d.pos.x - m.position.x;
            const cdz = d.pos.z - m.position.z;
            const cdist = Math.hypot(cdx, cdz);
            const hitR = (m.scaleMul ?? 1) * 1.2;
            if (cdist < hitR && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
              applyPlayerHit(d);
              d.iframesT = 1.2;
              shakeCamera(d, 0.85, 0.30);
              emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
              p.playSfx('strike_hit');
              p.haptic?.('heavy');
              p.onStrikeHit?.();
              sk.phase = 'recover';
              sk.phaseT = 0;
            } else if (sk.phaseT >= 0.7) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.7; m.velocity.z *= 0.7;
            if (sk.phaseT >= 0.5) {
              sk.phase = 'idle';
              sk.cooldownT = 3 + Math.random() * 2;     // v4 flank 4-6 → 3-5
            }
            continue;
          }
        } else if (sk.kind === 'rage') {
          // FIREFIGHTER RAGE — 1s red-glow charge-up → 3s sprint at
          // 1.5× speed with KB immunity → 1s recover. During active
          // the firefighter ignores knockback impulses and runs
          // straight at the player; contact damage on touch. 6-10s
          // cooldown.
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 2 && dist < 18) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
            // Fall through to regular melee AI during idle.
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            m.velocity.x *= 0.6; m.velocity.z *= 0.6;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= 1.0) {
              sk.phase = 'active';
              sk.phaseT = 0;
            }
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            // KB IMMUNITY — clear any knockback impulses applied this frame.
            m.knockbackT = 0;
            m.knockbackVX = 0;
            m.knockbackVZ = 0;
            // Sprint at the player at 1.5× speed.
            if (dist > 0.001) {
              const inv = 1 / dist;
              const sprintS = monsterBaseSpeed * 1.5;
              m.position.x += dx * inv * sprintS * c;
              m.position.z += dz * inv * sprintS * c;
              m.rotation = Math.atan2(dx, dz);
            }
            m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
            m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
            // Contact damage on touch.
            const cdx = d.pos.x - m.position.x;
            const cdz = d.pos.z - m.position.z;
            const cdist = Math.hypot(cdx, cdz);
            const hitR = (m.scaleMul ?? 1) * 1.3;
            if (cdist < hitR && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
              applyPlayerHit(d);
              d.iframesT = 1.2;
              shakeCamera(d, 0.90, 0.34);
              emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
              p.playSfx('strike_hit');
              p.haptic?.('heavy');
              p.onStrikeHit?.();
            }
            if (sk.phaseT >= 3.0) {
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.7; m.velocity.z *= 0.7;
            if (sk.phaseT >= 1.0) {
              sk.phase = 'idle';
              sk.cooldownT = 4 + Math.random() * 3;     // v4 rage 6-10 → 4-7
            }
            continue;
          }
        } else if (sk.kind === 'pounce') {
          // PUNK POUNCE — 0.3s crouch telegraph → 0.45s parabolic
          // leap landing at the player's position-at-launch (no
          // homing — they can sidestep mid-air) → 1.8u AOE damage
          // burst on landing → 0.5s recover. Cooldown 2.5-4s
          // (high-frequency rabid feel).
          const TG_T   = 0.30;
          const LEAP_T = 0.45;
          const REC_T  = 0.50;
          const AOE_R  = 1.8;
          const PEAK_H = 2.8;
          if (sk.phase === 'idle') {
            sk.cooldownT -= c;
            if (sk.cooldownT <= 0 && dist > 1.5 && dist < 12) {
              sk.phase = 'telegraph';
              sk.phaseT = 0;
              emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
              p.playSfx('strike_telegraph');
            }
          } else if (sk.phase === 'telegraph') {
            sk.phaseT += c;
            // Crouch — kill horizontal velocity, face player.
            m.velocity.x *= 0.5; m.velocity.z *= 0.5;
            if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
            if (sk.phaseT >= TG_T) {
              // Lock TARGET (absolute world pos) into sk.aimX/aimZ.
              // Stash LAUNCH pos into m.flightVX/flightVZ — these
              // are only used during dying, free to repurpose here.
              sk.aimX = d.pos.x;
              sk.aimZ = d.pos.z;
              m.flightVX = m.position.x;
              m.flightVZ = m.position.z;
              sk.phase = 'active';
              sk.phaseT = 0;
            }
            continue;
          } else if (sk.phase === 'active') {
            sk.phaseT += c;
            const frac = Math.min(1, sk.phaseT / LEAP_T);
            // Linear horizontal lerp launch → target.
            m.position.x = m.flightVX + (sk.aimX - m.flightVX) * frac;
            m.position.z = m.flightVZ + (sk.aimZ - m.flightVZ) * frac;
            m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
            m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));
            // Parabolic Y arc — visual lift; renderer copies m.position.
            m.position.y = Math.sin(frac * Math.PI) * PEAK_H;
            if (frac >= 1) {
              // LANDING — reset y, AOE damage check.
              m.position.y = 0;
              const ldx = d.pos.x - m.position.x;
              const ldz = d.pos.z - m.position.z;
              if (Math.hypot(ldx, ldz) < AOE_R && d.iframesT <= 0 && d.time > GRACE_PERIOD) {
                applyPlayerHit(d);
                d.iframesT = 1.2;
                shakeCamera(d, 0.95, 0.36);
                emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
                p.playSfx('strike_hit');
                p.haptic?.('heavy');
                p.onStrikeHit?.();
              } else {
                // Landing thump even on miss.
                shakeCamera(d, 0.45, 0.20);
                emitFx(d, 'strike_hit', m.position.x, m.position.z);
                p.playSfx('strike_hit');
              }
              // Splatter ring at impact.
              spawnBloodSplats(d, m.position.x, m.position.z, 10, 0.9);
              m.flightVX = 0;
              m.flightVZ = 0;
              sk.phase = 'recover';
              sk.phaseT = 0;
            }
            continue;
          } else {  // recover
            sk.phaseT += c;
            m.velocity.x *= 0.7; m.velocity.z *= 0.7;
            // Safety — ensure body is on the ground during recover.
            m.position.y = 0;
            if (sk.phaseT >= REC_T) {
              sk.phase = 'idle';
              sk.cooldownT = 1.8 + Math.random() * 1.2;    // v4 pounce 2.5-4 → 1.8-3 (rabid)
            }
            continue;
          }
        }
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
            // Elite stalkers spit 1.5× faster and reload 30% quicker so
            // the anti-stall pressure actually punishes idling.
            d.enemyProjectiles.push({
              id: nextId(),
              position: new THREE.Vector3(m.position.x, 1.1, m.position.z),
              dirX: m.strikeAimX,
              dirZ: m.strikeAimZ,
              bornAt: d.time,
              ttl: PROJECTILE_TTL,
              speedMul: m.isElite ? 1.5 : 1.0,
            });
            p.playSfx('strike_hit');
            m.state = 'cooldown';
            m.cooldownT = tuning.strikeCooldown * (m.isElite ? 1.0 : 1.4);   // longer between spits
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
              applyPlayerHit(d);
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
            applyPlayerHit(d);
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
          applyPlayerHit(d);
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
      d.muzzleFlashT = CARTRIDGE.visuals?.actionStyle === 'cat-swipe' ? 0.18 : 0.07;
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
          // SWAT SHIELD — if a shield boss has its shield raised and
          // the bullet is hitting from its frontal 120° cone, absorb
          // the hit (no damage, no kill). Player must flank.
          if (m.skill && m.skill.kind === 'shield' && m.skill.phase === 'active') {
            // Bullet direction is (b.dirX, b.dirZ); shield faces along
            // monster's facing direction (sin(rot), cos(rot)).
            const facingX = Math.sin(m.rotation);
            const facingZ = Math.cos(m.rotation);
            // Dot of -bullet direction with facing → if bullet is
            // coming FROM the front, dot > cos(60°).
            const incomingDot = -(b.dirX * facingX + b.dirZ * facingZ);
            if (incomingDot > 0.5) {
              // Absorbed — bullet stops here, no damage, small visual
              // ping at the impact point.
              emitFx(d, 'bullet_hit', b.position.x, b.position.z);
              b.hitIds.add(m.id);
              d.bullets.splice(i, 1);
              alive = false;
              continue;
            }
          }
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
          // Per-bullet shake is gated to high-HP tiers (brute/boss) so the
          // ~3/s auto-fire rate doesn't stack the camera into permanent
          // jitter on lurkers. Each hit on a meatier target gets a small
          // thump that sells the weight without nausea.
          if (m.tier === 'brute' || m.tier === 'boss') {
            shakeCamera(d, 0.10, 0.08);
          }
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
            // Kill shake — fires on the bullet that finishes a zombie.
            // Boss kill stays at the existing huge value; everything else
            // gets a quick punch so the "you ended that one" beat lands.
            if (m.tier === 'boss') shakeCamera(d, 0.95, 0.55);
            else                   shakeCamera(d, 0.18, 0.10);
            // Tutorial unlock — boss night was a disguised lesson; once
            // the player has killed a minotaur/mech/swat boss, that
            // kind unlocks as an ambient elite for later levels (gated
            // by AMBIENT_ELITE_UNLOCK_LEVEL).
            if (m.tier === 'boss' && m.bossKind && m.bossKind !== 'vampire') {
              d.defeatedBossKinds.add(m.bossKind);
            }
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
      const projSpeed = PROJECTILE_SPEED * (proj.speedMul ?? 1);
      proj.position.x += proj.dirX * projSpeed * c;
      proj.position.z += proj.dirZ * projSpeed * c;
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
        applyPlayerHit(d);
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
      // Defeated-boss elite spawn — at L11+ (after the 10-kind unlock
      // ladder completes at L10), small chance each trickle to spawn
      // one of the kinds the player has killed at least once as a
      // boss. Adds variety alongside the level-N bosses. Batch B
      // removed the !isBoss gate — every level is a boss level now,
      // so ambient elites coexist with the level's main boss(es).
      let spawned = false;
      if (
        d.level >= AMBIENT_ELITE_UNLOCK_LEVEL
        && d.defeatedBossKinds.size > 0
        && Math.random() < AMBIENT_ELITE_BASE_CHANCE
      ) {
        const pool = Array.from(d.defeatedBossKinds);
        const kind = pool[Math.floor(Math.random() * pool.length)];
        spawnAmbientElite(d, tuning, kind);
        spawned = true;
      }
      if (!spawned) {
        spawnMonsterTier(d, tuning, rollSpawnTier(d.level));
      }
    }
    d.surgeTimer += c;
    if (d.surgeTimer >= SURGE_PERIOD) {
      d.surgeTimer = 0;
      const count = SURGE_COUNT_BASE + (d.level - 1) * SURGE_COUNT_PER_NIGHT;
      for (let i = 0; i < count; i++) {
        spawnMonsterTier(d, tuning, rollSpawnTier(d.level));
      }
    }
    // Anti-stall — once the level overstays the threshold, escalate by
    // dropping an elite stalker every ELITE_INTERVAL seconds (capped) so
    // camping for free XP gets punished.
    if (
      !d.exit
      && d.levelT > LEVEL_STALL_THRESHOLD
      && d.elitesSpawnedThisLevel < MAX_ELITES_PER_LEVEL
      && (d.elitesSpawnedThisLevel === 0
          ? true
          : d.levelT - d.lastEliteSpawnT >= ELITE_INTERVAL)
    ) {
      spawnEliteStalker(d, tuning);
    }

    // ── Corner-camp punishment ─────────────────────────────────────
    // Detect player tucked in a corner of the arena (90° safe zone =
    // monsters can only approach from two open quadrants, easy to mow
    // with auto-fire). After CORNER_CAMP_THRESHOLD seconds, spawn a
    // burst of zombies AT close range around the player so they have
    // to move. Resets after each burst.
    const CORNER_MARGIN = 5;
    const inCorner =
      Math.abs(d.pos.x) > ARENA_HALF - CORNER_MARGIN &&
      Math.abs(d.pos.z) > ARENA_HALF - CORNER_MARGIN;
    if (inCorner) {
      d.cornerCampT += c;
    } else {
      // Quick decay when not in corner — short trips out shouldn't reset
      // the timer entirely, but moving out cleanly does.
      d.cornerCampT = Math.max(0, d.cornerCampT - c * 2);
    }
    if (d.cornerCampT > 6.0 && !d.exit && !d.gameOver) {
      // Punish — spawn 3 lurkers within 2.5-4u of the player, on the
      // FIELD-side semicircle (so they can actually reach the player
      // instead of clipping into the wall). The pull-out vector points
      // from player back toward arena center.
      const cx = -Math.sign(d.pos.x);
      const cz = -Math.sign(d.pos.z);
      // Center of the pull-out arc — bias toward field, not corner.
      const baseAng = Math.atan2(cx, cz);
      const BURST_N = 3;
      for (let i = 0; i < BURST_N; i++) {
        // Spread across ±70° of the field-facing semicircle.
        const ang = baseAng + (Math.random() - 0.5) * (140 * Math.PI / 180);
        const r = 2.6 + Math.random() * 1.4;
        const sx = d.pos.x + Math.sin(ang) * r;
        const sz = d.pos.z + Math.cos(ang) * r;
        // Clamp to arena bounds so we don't drop outside.
        const px = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, sx));
        const pz = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, sz));
        if (d.monsters.length >= tuning.monsterMax) break;
        // Spawn a runner (fast melee) — best for forcing the camp open.
        const hpBase = MONSTER_HP.runner;
        const hp = tuning.level > 3
          ? Math.round(hpBase * Math.min(8, 1 + (tuning.level - 3) * 0.28))
          : hpBase;
        d.monsters.push({
          id: nextId(),
          position: new THREE.Vector3(px, 0, pz),
          velocity: new THREE.Vector3(),
          rotation: Math.atan2(d.pos.x - px, d.pos.z - pz),
          state: 'lurking',
          fleeT: 0, cooldownT: 0, strikeT: 0,
          strikeAimX: 0, strikeAimZ: 0,
          tier: 'runner',
          hp, maxHp: hp,
          hitFlashT: 0,
          knockbackVX: 0, knockbackVZ: 0, knockbackT: 0,
          dying: false, dyingT: 0,
          flightVX: 0, flightVZ: 0, flightSpin: 0,
          deathStyle: 0, deathArc: 0,
          isBoss: false,
        });
      }
      d.cornerCampT = 0;
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
