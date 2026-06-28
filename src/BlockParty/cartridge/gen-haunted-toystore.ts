// Generated from: "a lone survivor trapped in a haunted toy store at midnight"
// Generated at: 2026-06-28T20:41:07.801Z
// Validation: passed

import type { CartridgeSpec } from './spec';

export const genHauntedToystoreSpec: CartridgeSpec = {
  "id": "haunted-toystore",
  "copy": {
    "en": {
      "title": "MIDNIGHT HAUNT",
      "subtitle": "SURVIVE THE HAUNTED TOY STORE · AUTO-FIRE · ENDLESS WAVES",
      "introSub": "ESCAPE THE SPOOKY NIGHT",
      "tapToStart": "START SURVIVING",
      "again": "TRY AGAIN",
      "ruleExplore": "Move with the stick — your hero auto-fires at the nearest ghostly toy.",
      "ruleCrystals": "Collect haunted marbles dropped by enemies to power up.",
      "ruleDark": "You have 9 lives; bosses appear every 3 waves with increasing menace."
    },
    "zh": {
      "title": "午夜鬼玩",
      "subtitle": "在鬼玩具店生存 · 自动射击 · 无限波次",
      "introSub": "逃离阴森夜晚",
      "tapToStart": "开始生存",
      "again": "再试一次",
      "ruleExplore": "摇杆移动 · 英雄自动攻击最近的幽灵玩具",
      "ruleCrystals": "收集敌人掉落的幽灵弹珠提升能力",
      "ruleDark": "拥有9条命；每3波出现一只更强的Boss"
    }
  },
  "palette": [
    {
      "name": "Eerie Twilight",
      "colors": {
        "floor": "#2a2430",
        "fog": "#1a1622",
        "ambient": "#3b3245",
        "hemiSky": "#4a4460",
        "hemiGround": "#2e2a3c",
        "pillar": "#5a5068"
      }
    },
    {
      "name": "Creepy Toybox",
      "colors": {
        "floor": "#3a3040",
        "fog": "#271f2f",
        "ambient": "#5a4960",
        "hemiSky": "#7a6780",
        "hemiGround": "#433a50",
        "pillar": "#714f6a"
      }
    },
    {
      "name": "Midnight Nightmare",
      "colors": {
        "floor": "#1f1927",
        "fog": "#0f0b15",
        "ambient": "#352f47",
        "hemiSky": "#5c5273",
        "hemiGround": "#251f36",
        "pillar": "#6a587a"
      }
    }
  ],
  "enemies": {
    "lurker": {
      "creature": "ghost",
      "name": "Possessed Doll",
      "recolor": "#8a70b8"
    },
    "runner": {
      "creature": "werewolf",
      "name": "Cursed Jack-in-the-Box",
      "recolor": "#6a4a9b"
    },
    "brute": {
      "creature": "skeleton",
      "name": "Broken Robot",
      "recolor": "#c8c5d8"
    },
    "stalker": {
      "creature": "mummy",
      "name": "Wrapped Teddy",
      "recolor": "#d0c8a0"
    },
    "exploder": {
      "creature": "zombie",
      "name": "Ragged Puppet",
      "recolor": "#6a6e4a"
    },
    "ghost": {
      "creature": "ghost",
      "name": "Haunted Yo-Yo",
      "recolor": "#a0a0e8"
    }
  },
  "bossLadder": [
    {
      "kind": "vampire",
      "name": "The Toymaker"
    },
    {
      "kind": "swat",
      "name": "Clockwork Guardian"
    },
    {
      "kind": "mech",
      "name": "Mechanical Nightmare"
    },
    {
      "kind": "minotaur",
      "name": "Giant Wind-Up Soldier"
    },
    {
      "kind": "viking",
      "name": "Ragged Teddy King"
    },
    {
      "kind": "punk",
      "name": "Broken Music Box"
    },
    {
      "kind": "cop",
      "name": "Security Doll"
    },
    {
      "kind": "cowboy",
      "name": "Jack-in-the-Box Beast"
    },
    {
      "kind": "goth",
      "name": "Phantom Marionette"
    },
    {
      "kind": "biker",
      "name": "Haunted Toy Racer"
    }
  ],
  "heroes": [
    {
      "id": "brave-child",
      "label": "BRAVE",
      "tint": "#7a68b3"
    },
    {
      "id": "night-wanderer",
      "label": "WANDER",
      "tint": "#5a4a7a"
    },
    {
      "id": "toy-reclaimer",
      "label": "RECLAIM",
      "tint": "#8a75b0"
    },
    {
      "id": "ghost-hunter",
      "label": "HUNTER",
      "tint": "#a0a0e8"
    },
    {
      "id": "shadow-kid",
      "label": "SHADOW",
      "tint": "#4a3a6a"
    },
    {
      "id": "midnight-runner",
      "label": "RUNNER",
      "tint": "#6a587a"
    }
  ],
  "starterHeroIds": [
    "brave-child",
    "ghost-hunter",
    "shadow-kid"
  ],
  "heroUnlockPrice": 200,
  "audioMood": 0.6,
  "photoHero": true
};
