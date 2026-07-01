// Generated from: "a cat surviving robot vacuums"
// Generated at: 2026-07-01T15:38:56.165Z
// Validation: passed

import type { CartridgeSpec } from './spec';

export const genCatVacuumSpec: CartridgeSpec = {
  "id": "cat-vacuum",
  "copy": {
    "en": {
      "title": "FUR FLOOD",
      "subtitle": "CAT VS ROBOT VACUUMS · AUTO-SWIPE · ENDLESS WAVES",
      "introSub": "DEFEND YOUR NAP SPOT",
      "tapToStart": "POUNCE IN",
      "again": "ANOTHER CATNAP",
      "ruleExplore": "Move with the stick — your cat auto-swipes the nearest vacuum.",
      "ruleCrystals": "Every vacuum drops a treat — walk over it to score.",
      "ruleDark": "9 lives. Endless waves — boss vacuum every 3rd wave, meaner each time."
    },
    "zh": {
      "title": "FUR FLOOD",
      "subtitle": "猫 vs 扫地机器人 · 自动出爪 · 无限波次",
      "introSub": "守住你的午睡角落",
      "tapToStart": "开挠",
      "again": "再睡一觉",
      "ruleExplore": "摇杆移动 · 猫猫自动挠最近的扫地机",
      "ruleCrystals": "每干掉一台扫地机掉一颗猫粮 · 走过去吃掉 = 加分",
      "ruleDark": "9 条命 · 每 3 波出一台巨型吸尘器，一波比一波凶"
    }
  },
  "palette": [
    {
      "name": "Morning Sunbeam",
      "colors": {
        "floor": "#f2e8d5",
        "fog": "#fffaf2",
        "ambient": "#fff5e6",
        "hemiSky": "#ffe0b2",
        "hemiGround": "#d7ccc8",
        "pillar": "#e8d5b7"
      }
    },
    {
      "name": "Afternoon Dust",
      "colors": {
        "floor": "#e8d5b7",
        "fog": "#faf5ed",
        "ambient": "#ffe0b2",
        "hemiSky": "#ffcc80",
        "hemiGround": "#bcaaa4",
        "pillar": "#d7ccc8"
      }
    },
    {
      "name": "Evening Red Alert",
      "colors": {
        "floor": "#c9a87c",
        "fog": "#f0e0d0",
        "ambient": "#ff8a65",
        "hemiSky": "#ff5722",
        "hemiGround": "#8d6e63",
        "pillar": "#a1887f"
      }
    }
  ],
  "enemies": {
    "lurker": {
      "creature": "zombie",
      "name": "Roomba",
      "recolor": "#d0d0d8",
      "spriteUrl": "/sprites/cat-vacuum/lurker.png"
    },
    "runner": {
      "creature": "werewolf",
      "name": "Stick Vac",
      "recolor": "#585860",
      "spriteUrl": "/sprites/cat-vacuum/runner.png"
    },
    "brute": {
      "creature": "skeleton",
      "name": "Canister Vac",
      "recolor": "#f0ece4",
      "spriteUrl": "/sprites/cat-vacuum/brute.png"
    },
    "stalker": {
      "creature": "mummy",
      "name": "Carpet Cleaner",
      "recolor": "#e8dcc8",
      "spriteUrl": "/sprites/cat-vacuum/stalker.png"
    },
    "exploder": {
      "creature": "ghost",
      "name": "Dust Buster",
      "recolor": "#ffeae0",
      "spriteUrl": "/sprites/cat-vacuum/exploder.png"
    },
    "ghost": {
      "creature": "zombie",
      "name": "Handheld Turbo",
      "recolor": "#a8c8e8",
      "spriteUrl": "/sprites/cat-vacuum/ghost.png"
    }
  },
  "bossLadder": [
    {
      "behavior": "vampire",
      "skin": "mech",
      "name": "Dyson Beast"
    },
    {
      "behavior": "minotaur",
      "skin": "firefighter",
      "name": "Industrial Scrubber"
    },
    {
      "behavior": "mech",
      "skin": "mech",
      "name": "Wet/Dry Titan"
    },
    {
      "behavior": "viking",
      "skin": "swat",
      "name": "ShopVac Warrior"
    },
    {
      "behavior": "punk",
      "skin": "biker",
      "name": "Handheld Turbo"
    },
    {
      "behavior": "cop",
      "skin": "cop",
      "name": "RoboMop Squad"
    },
    {
      "behavior": "cowboy",
      "skin": "cowboy",
      "name": "Steam Cleaner"
    },
    {
      "behavior": "goth",
      "skin": "goth",
      "name": "Auto-Empty Dock"
    },
    {
      "behavior": "biker",
      "skin": "biker",
      "name": "Cordless Stick"
    },
    {
      "behavior": "firefighter",
      "skin": "firefighter",
      "name": "Wet Floor Bot"
    }
  ],
  "heroes": [
    {
      "id": "tabby",
      "label": "TABBY",
      "tint": "#c8a050"
    },
    {
      "id": "tuxedo",
      "label": "TUXEDO",
      "tint": "#1c1c1c"
    },
    {
      "id": "ginger",
      "label": "GINGER",
      "tint": "#e89440"
    },
    {
      "id": "siamese",
      "label": "SIAMESE",
      "tint": "#d4c4b0"
    },
    {
      "id": "calico",
      "label": "CALICO",
      "tint": "#f0e0d0"
    },
    {
      "id": "void",
      "label": "VOID",
      "tint": "#0a0a0c"
    },
    {
      "id": "sphynx",
      "label": "SPHYNX",
      "tint": "#e8d0c0"
    },
    {
      "id": "tiger",
      "label": "TIGER",
      "tint": "#e08020"
    }
  ],
  "starterHeroIds": [
    "tabby",
    "tuxedo",
    "ginger"
  ],
  "heroUnlockPrice": 200,
  "audioMood": 0.25,
  "photoHero": true,
  "visuals": {
    "heroKind": "cat",
    "enemySet": "household",
    "actionStyle": "cat-swipe",
    "worldProps": "living-room",
    "debrisStyle": "household"
  },
  "feel": {
    "combatProfile": "close-swipe"
  }
};
