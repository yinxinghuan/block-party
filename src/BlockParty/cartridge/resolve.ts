// ============================================================================
//  RESOLVER — turn a pure-JSON CartridgeSpec into a runnable ArcadeCartridge by
//  binding its string keys to engine builders. This is the bridge between the
//  generator's output (data) and the engine's input (an ArcadeCartridge).
// ============================================================================

import * as THREE from 'three';
import type { ArcadeCartridge, EnemyRole } from './types';
import type { CartridgeSpec, NonBossRole } from './spec';
import { NON_BOSS_ROLES } from './spec';
import { CREATURE_BUILDERS, CREATURE_KEYS, recolorGroup } from '../builders/registry';
import { makeMonster } from '../builders/monsters';
import { makeVacuumEnemy } from '../builders/appliances';
import { makeCatHero, makeSurvivor, makeSurvivorWithFace, SURVIVOR_IDS } from '../builders/characters';
import { makeSpriteBillboard } from '../builders/sprites';
import type { BossLadderEntry } from '../constants';

// Per-role visual scale — mirrors makeMonster's non-boss targets so a generated
// creature sits at the same size its role expects. Boss is built via makeMonster
// (which applies its own per-kind scale).
const ROLE_SCALE: Record<NonBossRole, number> = {
  lurker: 0.66, runner: 0.62, brute: 0.78, stalker: 0.72, exploder: 0.66, ghost: 0.70,
};

const VISUAL_ENUMS = {
  heroKind: ['survivor', 'cat'],
  enemySet: ['creature', 'vacuum', 'household'],
  actionStyle: ['weapon', 'cat-swipe'],
  worldProps: ['street', 'living-room'],
  debrisStyle: ['gore', 'household'],
} as const;

const FEEL_ENUMS = {
  combatProfile: ['survivor-shooter', 'close-swipe'],
} as const;

/** Validate an untrusted spec (e.g. fresh LLM output). Returns the list of
 *  problems; empty array = good to resolve. Cheap structural checks only. */
export function validateSpec(s: unknown): string[] {
  const errs: string[] = [];
  const spec = s as Partial<CartridgeSpec>;
  if (!spec || typeof spec !== 'object') return ['spec is not an object'];
  if (!spec.id) errs.push('missing id');
  for (const loc of ['en', 'zh'] as const) {
    if (!spec.copy?.[loc]?.title) errs.push(`missing copy.${loc}.title`);
  }
  if (!Array.isArray(spec.palette) || spec.palette.length !== 3) {
    errs.push('palette must have exactly 3 entries');
  }
  for (const role of NON_BOSS_ROLES) {
    const e = spec.enemies?.[role];
    if (!e) { errs.push(`missing enemies.${role}`); continue; }
    if (!CREATURE_KEYS.includes(e.creature)) {
      errs.push(`enemies.${role}.creature "${e.creature}" not in [${CREATURE_KEYS.join(', ')}]`);
    }
  }
  if (!Array.isArray(spec.bossLadder) || spec.bossLadder.length < 1) {
    errs.push('bossLadder must have at least 1 entry');
  } else {
    spec.bossLadder.forEach((b, i) => {
      if (!b.kind && !b.behavior) errs.push(`bossLadder[${i}] missing kind or behavior`);
      if (!b.name) errs.push(`bossLadder[${i}] missing name`);
    });
  }
  if (!Array.isArray(spec.heroes) || spec.heroes.length < 1) {
    errs.push('heroes must have at least 1 entry');
  }
  if (spec.visuals) {
    for (const [key, valid] of Object.entries(VISUAL_ENUMS)) {
      const value = spec.visuals[key as keyof typeof VISUAL_ENUMS];
      if (value && !(valid as readonly string[]).includes(value)) {
        errs.push(`visuals.${key} "${value}" not in [${valid.join(', ')}]`);
      }
    }
  }
  if (spec.feel) {
    for (const [key, valid] of Object.entries(FEEL_ENUMS)) {
      const value = spec.feel[key as keyof typeof FEEL_ENUMS];
      if (value && !(valid as readonly string[]).includes(value)) {
        errs.push(`feel.${key} "${value}" not in [${valid.join(', ')}]`);
      }
    }
  }
  return errs;
}

/** Bind a (validated) spec to a runnable cartridge. Throws if invalid. */
export function specToCartridge(spec: CartridgeSpec): ArcadeCartridge {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(`invalid cartridge spec:\n- ${errs.join('\n- ')}`);

  const baseFor = (i: number) => SURVIVOR_IDS[i % SURVIVOR_IDS.length];
  const visuals = {
    heroKind: spec.visuals?.heroKind ?? (spec.id === 'cat-vacuum' ? 'cat' : 'survivor'),
    enemySet: spec.visuals?.enemySet ?? (spec.id === 'cat-vacuum' ? 'household' : 'creature'),
    actionStyle: spec.visuals?.actionStyle ?? (spec.id === 'cat-vacuum' ? 'cat-swipe' : 'weapon'),
    worldProps: spec.visuals?.worldProps ?? (spec.id === 'cat-vacuum' ? 'living-room' : 'street'),
    debrisStyle: spec.visuals?.debrisStyle ?? (spec.id === 'cat-vacuum' ? 'household' : 'gore'),
  } as const;
  const feel = {
    combatProfile: spec.feel?.combatProfile ?? (spec.id === 'cat-vacuum' ? 'close-swipe' : 'survivor-shooter'),
  } as const;

  // Pre-load sprite textures for every enemy role that has a spriteUrl.
  // TextureLoader.load returns immediately (empty texture) and fills async —
  // the sprite pops in when loaded. The group is still a valid THREE.Group.
  const loader = new THREE.TextureLoader();
  const spriteTextures = new Map<NonBossRole, THREE.Texture | null>();
  for (const role of NON_BOSS_ROLES) {
    const es = spec.enemies[role];
    if (es.spriteUrl) {
      spriteTextures.set(role, loader.load(es.spriteUrl));
    }
  }

  return {
    id: spec.id,
    copy: spec.copy,
    palette: spec.palette,
    bossLadder: spec.bossLadder.map((b): BossLadderEntry => {
      const behavior = b.behavior ?? b.kind!;
      return { behavior, skin: b.skin ?? b.kind ?? behavior, name: b.name };
    }),

    buildEnemy: (role: EnemyRole, bossSkin) => {
      if (visuals.enemySet === 'vacuum' || visuals.enemySet === 'household') return makeVacuumEnemy(role, visuals.enemySet);
      if (role === 'boss') return makeMonster('boss', bossSkin);

      // Sprite path — unique gen-image visual for this role
      const tex = spriteTextures.get(role as NonBossRole);
      if (tex) return makeSpriteBillboard(tex, ROLE_SCALE[role as NonBossRole]);

      // Fallback — house-style 3D creature + recolor
      const es = spec.enemies[role as NonBossRole];
      const g = CREATURE_BUILDERS[es.creature]();
      if (es.recolor) recolorGroup(g, es.recolor);
      g.scale.setScalar(ROLE_SCALE[role as NonBossRole]);
      return g;
    },

    // Heroes reuse the house-style archetypes (kept at full quality); the theme
    // shows through labels + palette + copy, and identity through the photo hero.
    buildHero: (id) => {
      const i = Math.max(0, spec.heroes.findIndex((h) => h.id === id));
      if (visuals.heroKind === 'cat') return makeCatHero(spec.heroes[i]?.tint ?? '#c8a050');
      return makeSurvivor(baseFor(i));
    },
    heroes: spec.heroes.map((h, i) => ({
      id: h.id,
      label: h.label,
      tint: h.tint,
      build: () => visuals.heroKind === 'cat' ? makeCatHero(h.tint) : makeSurvivor(baseFor(i)),
    })),
    starterHeroIds: spec.starterHeroIds.length ? spec.starterHeroIds : [spec.heroes[0].id],
    heroUnlockPrice: spec.heroUnlockPrice,

    buildHeroFromPhoto: spec.photoHero === false ? undefined : (tex) => makeSurvivorWithFace(tex),
    hideWeaponProps: visuals.actionStyle === 'cat-swipe',
    visuals,
    feel,

    audioMood: spec.audioMood,
  };
}
