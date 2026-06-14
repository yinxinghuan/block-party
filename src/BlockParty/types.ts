import * as THREE from 'three';
import type { CrystalType } from './constants';

export type Phase = 'splash' | 'playing' | 'gameover';

export interface Stick {
  active: boolean;
  x: number;
  y: number;
}

export type MonsterState = 'lurking' | 'fleeing' | 'striking' | 'cooldown';

export type MonsterTier = 'lurker' | 'stalker' | 'boss';

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
  // Cached compat aliases — keep `isBoss` for any external code still
  // reading it; new code should switch on `tier`.
  isBoss?: boolean;
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

export interface FxEvent {
  key: number;
  type: 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'monster_flee' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse'
      | 'bullet_hit' | 'monster_kill' | 'muzzle_flash';
  x: number;
  z: number;
  born: number;
}
