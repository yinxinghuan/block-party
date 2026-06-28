// ============================================================================
//  ZOMBIE CARTRIDGE — the canonical theme: graveyard-shift zombie survival on
//  an empty city block. This is the reference cartridge: it reproduces the
//  original Block Party exactly, and is the worked example every generated
//  cartridge is measured against.
//
//  Everything theme-specific lives HERE. The engine imports CARTRIDGE and
//  never names a zombie, a palette, or a boss directly.
// ============================================================================

import type { ArcadeCartridge } from './types';
import { makeMonster } from '../builders/monsters';
import {
  makeSurvivor,
  makeSurvivorWithFace,
  SURVIVOR_IDS,
  SURVIVOR_META,
  STARTER_SURVIVORS,
  SURVIVOR_UNLOCK_PRICE,
} from '../builders/characters';

// City block at night — three reads, rotated by (level-1) % 3.
//   twilight  asphalt + magenta + soft amber streetlamp haze
//   dusk      colder blue, more zombies, muted neon
//   blackout  bloody red ambient, boss enters
export const zombieCartridge: ArcadeCartridge = {
  id: 'zombie',

  copy: {
    en: {
      title: 'BLOCK PARTY',
      subtitle: 'GRAVEYARD SHIFT · AUTO-FIRE · ENDLESS NIGHTS',
      introSub: 'SURVIVE THE NIGHT',
      tapToStart: 'CLOCK IN',
      again: 'ONE MORE NIGHT',
      ruleExplore: 'Move with the stick — hero auto-fires at the nearest zombie.',
      ruleCrystals: 'Every zombie drops a green XP gem — walk over it to score.',
      ruleDark: '3 hearts. Endless nights — boss every 3rd, getting tougher.',
    },
    zh: {
      title: 'BLOCK PARTY',
      subtitle: '夜班街区 · 自动开火 · 撑到最后一刻',
      introSub: '撑过这一夜',
      tapToStart: '出门干活',
      again: '再上一晚',
      ruleExplore: '摇杆移动 · 自动锁最近僵尸开火',
      ruleCrystals: '杀僵尸掉绿水晶 · 走过去吸到 = 加分',
      ruleDark: '3 心血量 · 被咬一口红屏闪 · boss 每三关一只，越往后越凶',
    },
  },

  palette: [
    {
      name: 'Twilight',
      colors: { floor: '#23283d', fog: '#0a0d18', ambient: '#322856', hemiSky: '#46367a', hemiGround: '#101220', pillar: '#2c2e44' },
    },
    {
      name: 'Dusk',
      colors: { floor: '#1c233a', fog: '#06080f', ambient: '#1f2c52', hemiSky: '#2e4e7a', hemiGround: '#0a1322', pillar: '#1f2a3c' },
    },
    {
      name: 'Blackout',
      colors: { floor: '#26161c', fog: '#0a0608', ambient: '#421824', hemiSky: '#542026', hemiGround: '#100810', pillar: '#3a1e22' },
    },
  ],

  buildEnemy: (role, bossKind) => makeMonster(role, bossKind),

  // The 10-boss unlock ladder (L1 → first boss the player ever sees). Each rung
  // is an engine behaviour archetype with a matching themed builder.
  bossLadder: [
    'vampire',     // L1  — melee
    'minotaur',    // L2  — charge (heavy)
    'mech',        // L3  — beam
    'viking',      // L4  — shield
    'punk',        // L5  — charge (rabid)
    'cop',         // L6  — summon
    'cowboy',      // L7  — burstfire
    'goth',        // L8  — blink
    'biker',       // L9  — flank
    'firefighter', // L10 — rage
  ],

  buildHero: (heroId) => makeSurvivor(heroId as Parameters<typeof makeSurvivor>[0]),

  buildHeroFromPhoto: (faceTex) => makeSurvivorWithFace(faceTex),

  heroes: SURVIVOR_IDS.map((id) => ({
    id,
    label: SURVIVOR_META[id].label,
    tint: SURVIVOR_META[id].tint,
    build: () => makeSurvivor(id),
  })),

  starterHeroIds: [...STARTER_SURVIVORS],

  heroUnlockPrice: SURVIVOR_UNLOCK_PRICE,

  audioMood: 0.4,
};
