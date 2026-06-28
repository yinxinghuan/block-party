// ============================================================================
//  CARTRIDGE — single swap point for the engine's theme.
//  To make a new game from this engine: author a new cartridge file (copy
//  zombie.ts), wire its builders/palette/copy, and point CARTRIDGE at it.
//  Nothing else in the engine changes.
// ============================================================================

import type { ArcadeCartridge } from './types';
import { zombieCartridge } from './zombie';

export const CARTRIDGE: ArcadeCartridge = zombieCartridge;

export type { ArcadeCartridge, EnemyRole, HeroId, HeroSkin, CartridgeCopy, BossKind } from './types';
