// ============================================================================
//  CAT-VACUUM CARTRIDGE — "a cat surviving a flood of robot vacuums"
//  Proof cartridge #2: reskin the top-down survival engine into a warm living
//  room where the player (a housecat) fights waves of household cleaning bots.
//
//  This cartridge goes through the CartridgeSpec → resolve.ts pipeline (the
//  same path a future LLM generator will use), proving the full spec-to-engine
//  bridge. palette + copy + enemies + heroes ALL differ from zombie.
//
//  Theme: cozy domestic apocalypse — warm wood floors, cream walls, appliances
//  gone rogue while you defend your sunbeam nap spot.
// ============================================================================

import type { CartridgeSpec } from './spec';

export const catVacuumSpec: CartridgeSpec = {
  id: 'cat-vacuum',

  copy: {
    en: {
      title: 'FUR FLOOD',
      subtitle: 'CAT VS ROBOT VACUUMS · AUTO-SWIPE · ENDLESS WAVES',
      introSub: 'DEFEND YOUR NAP SPOT',
      tapToStart: 'POUNCE IN',
      again: 'ANOTHER CATNAP',
      ruleExplore: 'Move with the stick — your cat auto-swipes the nearest vacuum.',
      ruleCrystals: 'Every vacuum drops a treat — walk over it to score.',
      ruleDark: '9 lives. Endless waves — boss vacuum every 3rd wave, meaner each time.',
    },
    zh: {
      title: 'FUR FLOOD',
      subtitle: '猫 vs 扫地机器人 · 自动出爪 · 无限波次',
      introSub: '守住你的午睡角落',
      tapToStart: '开挠',
      again: '再睡一觉',
      ruleExplore: '摇杆移动 · 猫猫自动挠最近的扫地机',
      ruleCrystals: '每干掉一台扫地机掉一颗猫粮 · 走过去吃掉 = 加分',
      ruleDark: '9 条命 · 每 3 波出一台巨型吸尘器，一波比一波凶',
    },
  },

  // Living-room colour cycle — warm wood, cream walls, sunbeam → dusk → red-alert evening.
  palette: [
    {
      name: 'Morning Sunbeam',
      colors: {
        floor: '#f2e8d5',
        fog: '#fffaf2',
        ambient: '#fff5e6',
        hemiSky: '#ffe0b2',
        hemiGround: '#d7ccc8',
        pillar: '#e8d5b7',
      },
    },
    {
      name: 'Afternoon Dust',
      colors: {
        floor: '#e8d5b7',
        fog: '#faf5ed',
        ambient: '#ffe0b2',
        hemiSky: '#ffcc80',
        hemiGround: '#bcaaa4',
        pillar: '#d7ccc8',
      },
    },
    {
      name: 'Evening Red Alert',
      colors: {
        floor: '#c9a87c',
        fog: '#f0e0d0',
        ambient: '#ff8a65',
        hemiSky: '#ff5722',
        hemiGround: '#8d6e63',
        pillar: '#a1887f',
      },
    },
  ],

  // Every non-boss role mapped to a house-style creature + appliance recolor.
  // Same creature models → shifted to white/silver/beige → reads as "clean
  // household bot", not "rotting undead".
  enemies: {
    lurker:   { creature: 'zombie',   name: 'Roomba',          recolor: '#d0d0d8' }, // silver disc
    runner:   { creature: 'werewolf', name: 'Stick Vac',       recolor: '#585860' }, // dark gray upright
    brute:    { creature: 'skeleton', name: 'Canister Vac',    recolor: '#f0ece4' }, // cream tank
    stalker:  { creature: 'mummy',    name: 'Carpet Cleaner',  recolor: '#e8dcc8' }, // beige scrubber
    exploder: { creature: 'ghost',    name: 'Dust Buster',     recolor: '#ffeae0' }, // warm-white handheld
    ghost:    { creature: 'zombie',   name: 'Handheld Turbo',  recolor: '#a8c8e8' }, // pale blue mini
  },

  // Boss ladder — behaviour is engine-owned; skin is cartridge-owned. This
  // proves a reskin can keep a proven boss move while choosing a more fitting
  // visual silhouette for the new theme.
  bossLadder: [
    { behavior: 'vampire',     skin: 'mech',        name: 'Dyson Beast' },
    { behavior: 'minotaur',    skin: 'firefighter', name: 'Industrial Scrubber' },
    { behavior: 'mech',        skin: 'mech',        name: 'Wet/Dry Titan' },
    { behavior: 'viking',      skin: 'swat',        name: 'ShopVac Warrior' },
    { behavior: 'punk',        skin: 'biker',       name: 'Handheld Turbo' },
    { behavior: 'cop',         skin: 'cop',         name: 'RoboMop Squad' },
    { behavior: 'cowboy',      skin: 'cowboy',      name: 'Steam Cleaner' },
    { behavior: 'goth',        skin: 'goth',        name: 'Auto-Empty Dock' },
    { behavior: 'biker',       skin: 'biker',       name: 'Cordless Stick' },
    { behavior: 'firefighter', skin: 'firefighter', name: 'Wet Floor Bot' },
  ],

  // Cat-themed hero roster — labels + swatches; visuals reuse house-style
  // survivor archetypes (the coat colours carry the cat identity).
  heroes: [
    { id: 'tabby',   label: 'TABBY',   tint: '#c8a050' },
    { id: 'tuxedo',  label: 'TUXEDO',  tint: '#1c1c1c' },
    { id: 'ginger',  label: 'GINGER',  tint: '#e89440' },
    { id: 'siamese', label: 'SIAMESE', tint: '#d4c4b0' },
    { id: 'calico',  label: 'CALICO',  tint: '#f0e0d0' },
    { id: 'void',    label: 'VOID',    tint: '#0a0a0c' },
    { id: 'sphynx',  label: 'SPHYNX',  tint: '#e8d0c0' },
    { id: 'tiger',   label: 'TIGER',   tint: '#e08020' },
  ],

  starterHeroIds: ['tabby', 'tuxedo', 'ginger'],
  heroUnlockPrice: 200,

  // Lighter audio mood — playful rather than ominous.
  audioMood: 0.25,

  // Keep photo-hero: play as your own cat (face on the hero).
  photoHero: true,
};
