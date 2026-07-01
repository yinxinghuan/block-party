// ============================================================================
//  CARTRIDGE — single swap point for the engine's theme.
//  To make a new game from this engine: author a new cartridge, wire it here,
//  and `npm run build`. Nothing else in the engine changes.
//
//  Two cartridge styles are available:
//   - Hand-written (zombie.ts): calls builders directly, full creative control.
//   - Spec-driven  (cat-vacuum.ts): pure JSON → resolve.ts binds string keys to
//     engine builders. This is the path the generator (LLM) will target.
//
//  To switch: replace the RHS below — `specToCartridge(catVacuumSpec)` for the
//  cat-vacuum theme, or `zombieCartridge` for the original graveyard survival.
//  Both build zero-regression.
// ============================================================================

import type { ArcadeCartridge } from './types';
import { specToCartridge } from './resolve';
import { genCatVacuumSpec } from './gen-cat-vacuum';

export const CARTRIDGE: ArcadeCartridge = specToCartridge(genCatVacuumSpec);

export type { ArcadeCartridge, EnemyRole, HeroId, HeroSkin, CartridgeCopy, BossKind } from './types';
