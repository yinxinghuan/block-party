// ============================================================================
//  CARTRIDGE SPEC — the PURE-JSON theme a generator (LLM) or a user produces.
//  No functions, no THREE objects: just data an LLM can emit and a human can
//  read. `resolve.ts` turns a CartridgeSpec into a runnable ArcadeCartridge by
//  binding its string keys to engine builders.
//
//  This is the contract the cartridge GENERATOR targets. Keep it small and
//  every field author-able from one sentence.
// ============================================================================

import type { BossBehavior, BossKind, BossSkin, CartridgeCopy, EnemyRole } from './types';
import type { LevelPalette } from '../constants';
import type { CreatureKey } from '../builders/registry';

/** Gameplay roles a spec themes (boss is themed via `bossLadder`, not here). */
export type NonBossRole = Exclude<EnemyRole, 'boss'>;

export interface EnemySpec {
  /** which house-style creature fills this role (see CREATURE_KEYS) */
  creature: CreatureKey;
  /** themed display name, e.g. "Roomba", "Night Shopper" */
  name: string;
  /** optional hex colour to shift the creature toward; omit to keep native */
  recolor?: string;
  /** optional gen-image sprite URL (R2 permanent). When present, the engine
   *  renders this enemy as a textured billboard instead of a 3D creature,
   *  giving each generated theme unique enemy visuals. */
  spriteUrl?: string;
}

export interface BossSpec {
  /** Back-compat shorthand: old specs used one key for behaviour + visual. */
  kind?: BossKind;
  /** engine-owned AI archetype */
  behavior?: BossBehavior;
  /** cartridge-owned visual skin */
  skin?: BossSkin;
  /** themed display name */
  name: string;
}

export interface HeroSpec {
  id: string;     // stable slug
  label: string;  // store/splash label, e.g. "RUNNER"
  tint: string;   // swatch hex for the store chip
}

export interface CartridgeSpec {
  id: string;
  copy: Record<'en' | 'zh', CartridgeCopy>;
  /** EXACTLY 3 entries — the night cycle the engine rotates through */
  palette: { name: string; colors: LevelPalette }[];
  /** every non-boss role must be present */
  enemies: Record<NonBossRole, EnemySpec>;
  /** ordered boss ladder (rung 1 = first boss seen); at least 1 */
  bossLadder: BossSpec[];
  /** at least 1 hero; built from house-style archetypes, themed labels */
  heroes: HeroSpec[];
  starterHeroIds: string[];
  heroUnlockPrice: number;
  audioMood?: number;
  /** identity games: offer "play as me" (face on the hero). Default true. */
  photoHero?: boolean;
}

/** The non-boss roles a valid spec must define, in display order. */
export const NON_BOSS_ROLES: NonBossRole[] = [
  'lurker', 'runner', 'brute', 'stalker', 'exploder', 'ghost',
];
