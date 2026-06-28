// ============================================================================
//  ARCADE CARTRIDGE — the theme contract for the top-down survival engine.
// ----------------------------------------------------------------------------
//  The engine (useGameLoop / Scene / constants tuning) is LOCKED: it owns all
//  gameplay — difficulty curve, HP/speed/score per role, auto-fire, collision,
//  knockback, ragdoll, boss behaviours, juice, audio, leaderboard, social.
//
//  A CARTRIDGE owns ONLY the theme: what each gameplay slot LOOKS like and is
//  CALLED. Swap the cartridge → new game; the engine never changes. This is
//  the seam that lets a novice's "a cat surviving robot vacuums" become a
//  Block-Party-grade game without touching a single tuning number.
//
//  HARD RULE: nothing in here is allowed to carry gameplay tuning (HP, speed,
//  damage, spawn rates, cooldowns). Those live in constants.ts and are the
//  engine's, not the theme's. If a field would change how HARD the game is,
//  it does not belong in a cartridge.
// ============================================================================

import type * as THREE from 'three';
import type { CharacterGroup } from '../builders/characters';
import type { ZombieGroup, ZombieTier, BossKind } from '../builders/monsters';
import type { LevelPalette } from '../constants';

/** A gameplay ROLE the engine schedules and tunes. The cartridge supplies a
 *  visual + label per role; the engine owns HP/speed/score/knockback for it. */
export type EnemyRole = ZombieTier; // lurker|runner|brute|stalker|exploder|ghost|boss

/** A boss-behaviour archetype the engine implements (charge / beam / shield /
 *  summon / burstfire / blink / flank / rage / melee). The cartridge picks
 *  WHICH behaviours form its ladder and supplies the matching visual through
 *  `buildEnemy('boss', kind)`. NOTE: today BossKind couples behaviour + visual
 *  inside builders/monsters.ts; splitting "behaviour" from "skin" so a reskin
 *  can reuse a behaviour under a new look is the next seam (see README). */
export type { BossKind };

/** Localized, user-visible copy. Generic chrome (score/best/leaderboard) stays
 *  in the engine i18n; the cartridge only overrides the themed strings. */
export interface CartridgeCopy {
  title: string;
  subtitle: string;
  introSub: string;
  tapToStart: string;
  again: string;
  ruleExplore: string;
  ruleCrystals: string;
  ruleDark: string;
}

/** Hero identifier — opaque to the engine. The cartridge defines the valid set
 *  via `heroes`; the engine only ever passes these strings back to buildHero. */
export type HeroId = string;

/** One playable hero skin for the store / splash. Visual only — every hero
 *  plays identically; the engine does not read stats off this. */
export interface HeroSkin {
  id: HeroId;
  label: string;
  tint: string; // swatch hex for the store chip
  build: () => CharacterGroup;
}

export interface ArcadeCartridge {
  /** stable slug — also the localStorage / asset namespace for this theme */
  id: string;

  /** themed copy per locale; merged over the engine's generic i18n base */
  copy: Record<'en' | 'zh', CartridgeCopy>;

  /** 3-entry palette cycle. The engine rotates it by (level-1) % 3 and reads
   *  `colors` for lighting/fog/floor and `name` for the night chrome. */
  palette: { name: string; colors: LevelPalette }[];

  /** Build the visual for a gameplay role. For role 'boss' the engine passes
   *  the scheduled behaviour kind so the cartridge returns the right variant. */
  buildEnemy: (role: EnemyRole, bossKind?: BossKind) => ZombieGroup;

  /** Ordered boss ladder — index = (level-1) unlock for the first N levels,
   *  then rotated. The engine owns the schedule; the cartridge owns which
   *  themed boss fills each rung. */
  bossLadder: BossKind[];

  /** Build the player's visual for a chosen hero id. */
  buildHero: (heroId: HeroId) => CharacterGroup;

  /** Optional — IDENTITY GAMES. Build the hero from a user's face texture: the
   *  low-poly body stays in house style, the player's face maps onto the head.
   *  When present, the engine offers a "play as me" hero (photo / avatar). The
   *  returned group MUST expose the same `userData.rig` as buildHero so the
   *  engine can attach weapons/lights to it. */
  buildHeroFromPhoto?: (faceTex: THREE.Texture) => CharacterGroup;

  /** Player roster surfaced in the store / splash (visual only). */
  heroes: HeroSkin[];

  /** Hero ids unlocked for free at the start; the rest cost heroUnlockPrice. */
  starterHeroIds: HeroId[];

  /** Score-credits to unlock a non-starter hero. (Cosmetic gate, not balance.) */
  heroUnlockPrice: number;

  /** 0..1 ambient-audio mood floor; maps to the engine's bgmTension baseline.
   *  Higher = more constant eerie melody from level 1. Optional (default 0.4). */
  audioMood?: number;
}
