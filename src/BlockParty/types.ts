import * as THREE from 'three';
import type { CrystalType } from './constants';

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
  // Cached compat aliases — keep `isBoss` for any external code still
  // reading it; new code should switch on `tier`.
  isBoss?: boolean;
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

export type PillarVariant = 'spike' | 'dome' | 'cluster';

export interface Pillar {
  id: number;
  position: THREE.Vector3;
  scale: number;
  rot: number;
  variant: PillarVariant;
}

// Short-lived blood splat / bone chunk thrown by a bullet hit. Carries its
// own velocity so it arcs (gravity in useFrame). Scene.tsx pools these
// through an InstancedMesh.
export interface BloodSplat {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  bornAt: number;
  life: number;       // seconds before it pops out
  scale: number;      // box edge length
  isBone: boolean;    // bone fragments render cream; otherwise blood red
}

export interface FxEvent {
  key: number;
  type: 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'monster_flee' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse'
      | 'bullet_hit' | 'monster_kill' | 'muzzle_flash';
  x: number;
  z: number;
  born: number;
}
