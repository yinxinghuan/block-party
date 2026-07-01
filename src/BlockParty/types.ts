import * as THREE from 'three';
import type { BossBehavior, BossSkin, CrystalType } from './constants';

export type Phase = 'splash' | 'playing' | 'gameover';

export interface Stick {
  active: boolean;
  x: number;
  y: number;
}

export type MonsterState = 'lurking' | 'fleeing' | 'striking' | 'cooldown';

export type MonsterTier = 'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost' | 'boss';

export interface Monster {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: number;
  state: MonsterState;
  fleeT: number;
  cooldownT: number;
  strikeT: number;        // counts up: 0→TELEGRAPH = warning, then up to +LIVE = live, then resets
  strikeAimX: number;
  strikeAimZ: number;
  tier: MonsterTier;
  hp: number;             // remaining health — depleted by bullets
  maxHp: number;          // for the per-tier HP bar reset
  hitFlashT: number;      // visual: counts down from a small value on each bullet hit
  // Knockback velocity — set on bullet hit; integrated each frame, decays.
  // While > 0 the AI movement code is suppressed so the zombie SKIDS back
  // visibly instead of just teleporting one step over.
  knockbackVX: number;
  knockbackVZ: number;
  knockbackT: number;
  // Death-ragdoll launch. When hp hits 0, the monster is NOT immediately
  // spliced — it's marked dying + given a high-impulse velocity along
  // the killing bullet's direction, tumbles for ~0.6s, plows into any
  // live monsters in its path (damaging them), then finalizes with a
  // big death burst. Auto-fire + bite hit-tests both ignore dying.
  dying: boolean;
  dyingT: number;
  flightVX: number;
  flightVZ: number;
  flightSpin: number;       // tumble rate while flying (rad/s)
  /** Death-style variant 0..3 — picks which axis the body tumbles on
   *  and which limb pose freezes in place so a wave of dying zombies
   *  doesn't look like 5 copies of the same animation. */
  deathStyle: number;
  /** Arc peak height (u) — randomized per kill for visual variety. */
  deathArc: number;
  // Cached compat aliases — keep `isBoss` for any external code still
  // reading it; new code should switch on `tier`.
  isBoss?: boolean;
  /** Elite (anti-stall) marker — spawned when a level runs past the
   *  stall threshold. Doubles HP + adds a red emissive ring + spits
   *  faster projectiles. Used as a soft cap on camping early levels
   *  for free XP. */
  isElite?: boolean;
  /** Visual + collision size multiplier. Currently used by the boss
   *  spawner to scale the body with the cycle (bigger boss = stronger
   *  boss as a readable cue). Defaults to 1.0 in the renderer. */
  scaleMul?: number;
  /** Boss behaviour archetype — controls AI skill only. */
  bossKind?: BossBehavior;
  /** Boss skin archetype — controls visual builder only. Defaults to bossKind. */
  bossSkin?: BossSkin;
  /** Skill state machine — populated for elite/boss kinds with unique
   *  behaviors. The AI loop branches on `skill.kind` and runs the
   *  appropriate signature move. */
  skill?: {
    kind: 'charge' | 'beam' | 'shield'
        | 'pounce'    // punk — short parabolic leap + AOE on landing
        | 'summon'    // cop — calls 2 lurkers to spawn nearby
        | 'burstfire' // cowboy — 3 rapid revolver shots
        | 'blink'     // goth — vanishes + reappears near player back
        | 'flank'     // biker — passive perpendicular-to-player movement
        | 'rage';     // firefighter — speed boost + KB immune burst
    /** Sub-state machine — semantics vary per skill but the field is
     *  shared so the dispatcher can do a single switch. */
    phase: 'idle' | 'telegraph' | 'active' | 'recover';
    /** Time accumulated in the current phase. */
    phaseT: number;
    /** Time until the next skill activation can start (decrements
     *  every frame while phase='idle'). */
    cooldownT: number;
    /** Locked direction for charge/beam — set at the END of telegraph
     *  so the player has a window to dodge. (Unit vector in XZ.) */
    aimX: number;
    aimZ: number;
  };
}

// Enemy ranged projectile — spitters (the stalker tier) lob these. Linear
// travel, no homing; player must sidestep the path.
export interface EnemyProjectile {
  id: number;
  position: THREE.Vector3;
  dirX: number;
  dirZ: number;
  bornAt: number;
  ttl: number;
  /** Optional speed multiplier — defaults to 1. Elite stalkers spit
   *  faster to make their pressure read as a real threat. */
  speedMul?: number;
}

// Violet exit beacon spawned when the player meets the night's kill goal.
// Touching it within EXIT_PICKUP_RADIUS clears the night.
export interface ExitStone {
  position: THREE.Vector3;
  /** Time the exit was summoned — drives the "EXIT OPEN" toast cooldown. */
  bornAt: number;
}

// Power-up dropped on the street. Walking into it auto-applies the perk;
// no modal, no pause. Each perk type has its own tint + label so the
// world tells the player what they're picking up.
export interface PerkDrop {
  id: number;
  position: THREE.Vector3;
  perkId: string;
  bornAt: number;
}

// Hero auto-fired projectile. Linear travel along (dirX, dirZ), expires
// after ttl seconds, after pierce runs out, or at the arena edge.
export interface Bullet {
  id: number;
  position: THREE.Vector3;
  dirX: number;
  dirZ: number;
  bornAt: number;
  dmg: number;
  /** Per-bullet speed multiplier captured at fire time so the bullet
   *  flies at the weapon's spec speed even after the player swaps
   *  weapons. */
  speedMul: number;
  /** Weapon id the bullet came from — drives the per-weapon visual
   *  (tint, size, glow) in the Bullets renderer. */
  weaponId: string;
  /** Hits remaining after the current one before despawn. 0 = single
   *  target (default), >0 = bullet keeps going through that many extra
   *  enemies. Driven by the +pierce perk. */
  pierceLeft: number;
  /** Monster ids already hit by this bullet — prevents double-counting
   *  the same enemy when pierce > 0. */
  hitIds: Set<number>;
}

export interface Crystal {
  id: number;
  position: THREE.Vector3;
  type: CrystalType;
}

export interface Wall {
  id: number;
  position: THREE.Vector3;
  bornAt: number;
}

export type PillarVariant =
  | 'spike'           // streetlamp (twilight cycle, all)
  | 'dome'            // parked sedan (twilight cycle, all)
  | 'cluster'         // dumpster (twilight cycle, all)
  | 'barricade'       // police A-frame + reflective tape (dusk cycle — siege)
  | 'boardedShop'     // boarded-up shopfront + nailed planks (dusk cycle)
  | 'tippedDumpster'  // toppled trash bin + spilled contents (dusk cycle)
  | 'wreckCruiser'    // overturned police car w/ strobing lightbar (dusk cycle)
  | 'burnBarrel'      // burning oil drum (blackout cycle — apocalypse)
  | 'wreckTruck'      // crashed box truck (blackout cycle)
  | 'steamGrate'      // ground steam grate, walkable (blackout cycle)
  | 'bodyBag';        // ground body bag, walkable (blackout cycle)

export interface Pillar {
  id: number;
  position: THREE.Vector3;
  scale: number;
  rot: number;
  variant: PillarVariant;
}

// Short-lived impact debris thrown by a hit/kill. Older code called these
// blood splats; cartridges can now map the same physics to softer materials.
export type DebrisKind = 'blood' | 'bone' | 'dust' | 'spark' | 'fur' | 'confetti';
export interface BloodSplat {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  bornAt: number;
  life: number;       // seconds before it pops out
  scale: number;      // box edge length
  isBone: boolean;    // bone fragments render cream; otherwise blood red
  kind?: DebrisKind;
}

export interface FxEvent {
  key: number;
  type: 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'monster_flee' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse'
      | 'bullet_hit' | 'monster_kill' | 'muzzle_flash';
  x: number;
  z: number;
  born: number;
}
