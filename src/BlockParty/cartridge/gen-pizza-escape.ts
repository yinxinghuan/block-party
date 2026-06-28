// Generated from: "a sentient slice of pizza escaping a hungry office worker's lunch raid"
// Generated at: 2026-06-28T20:41:59.328Z
// Validation: passed

import type { CartridgeSpec } from './spec';

export const genPizzaEscapeSpec: CartridgeSpec = {
  "id": "pizza-escape",
  "copy": {
    "en": {
      "title": "SLICE RUN",
      "subtitle": "PIZZA VS OFFICE RAIDERS · AUTO-BAKE · ENDLESS HUNGER",
      "introSub": "SAVE YOUR SLICE",
      "tapToStart": "RUN HOT",
      "again": "BAKE AGAIN",
      "ruleExplore": "Move with the stick — your slice auto-tosses cheese at threats.",
      "ruleCrystals": "Collect toppings to power up your slice and score points.",
      "ruleDark": "3 slices to spare — boss raiders strike every 5 waves, growing hungrier."
    },
    "zh": {
      "title": "SLICE RUN",
      "subtitle": "披萨 vs 办公室抢餐者 · 自动烘烤 · 无限饥饿",
      "introSub": "保住你的披萨片",
      "tapToStart": "热力奔跑",
      "again": "再烤一次",
      "ruleExplore": "摇杆移动 · 披萨片自动抛奶酪攻击敌人",
      "ruleCrystals": "收集配料强化披萨片并得分",
      "ruleDark": "3片生命 · 每5波出现一波大胃王，越来越饿"
    }
  },
  "palette": [
    {
      "name": "Cheesy Morning",
      "colors": {
        "floor": "#f9e5b3",
        "fog": "#fff8e1",
        "ambient": "#fff3c4",
        "hemiSky": "#ffecb3",
        "hemiGround": "#d7c49e",
        "pillar": "#e6c27a"
      }
    },
    {
      "name": "Spicy Noon",
      "colors": {
        "floor": "#f4c26b",
        "fog": "#fff1d0",
        "ambient": "#ffd180",
        "hemiSky": "#ffb74d",
        "hemiGround": "#b78a4a",
        "pillar": "#d9963a"
      }
    },
    {
      "name": "Saucy Dusk",
      "colors": {
        "floor": "#d95f29",
        "fog": "#fbe4d5",
        "ambient": "#ff8a50",
        "hemiSky": "#e65100",
        "hemiGround": "#7c3f1a",
        "pillar": "#a84311"
      }
    }
  ],
  "enemies": {
    "lurker": {
      "creature": "zombie",
      "name": "Hungry Cubicle",
      "recolor": "#805020"
    },
    "runner": {
      "creature": "werewolf",
      "name": "Snack Stalker",
      "recolor": "#a65313"
    },
    "brute": {
      "creature": "skeleton",
      "name": "Lunch Breaker",
      "recolor": "#b87333"
    },
    "stalker": {
      "creature": "mummy",
      "name": "Office Ghost",
      "recolor": "#d9b382"
    },
    "exploder": {
      "creature": "ghost",
      "name": "Spilled Coffee",
      "recolor": "#6b3e1d"
    },
    "ghost": {
      "creature": "zombie",
      "name": "Desk Raider",
      "recolor": "#a05a2a"
    }
  },
  "bossLadder": [
    {
      "kind": "vampire",
      "name": "Caffeine Fiend"
    },
    {
      "kind": "swat",
      "name": "Lunchroom Enforcer"
    },
    {
      "kind": "mech",
      "name": "Snackbot 3000"
    },
    {
      "kind": "minotaur",
      "name": "Cubicle Crusher"
    },
    {
      "kind": "viking",
      "name": "Buffet Berserker"
    },
    {
      "kind": "punk",
      "name": "Graffiti Grazer"
    },
    {
      "kind": "cop",
      "name": "Office Sheriff"
    },
    {
      "kind": "cowboy",
      "name": "Pizza Wrangler"
    },
    {
      "kind": "goth",
      "name": "Midnight Snacker"
    },
    {
      "kind": "biker",
      "name": "Lunch Rush Rider"
    }
  ],
  "heroes": [
    {
      "id": "pepperoni",
      "label": "PEPPERONI",
      "tint": "#b33a1a"
    },
    {
      "id": "margherita",
      "label": "MARGHERITA",
      "tint": "#f7d08a"
    },
    {
      "id": "veggie",
      "label": "VEGGIE",
      "tint": "#7dbb3b"
    },
    {
      "id": "hawaiian",
      "label": "HAWAIIAN",
      "tint": "#f4a460"
    },
    {
      "id": "bbq-chicken",
      "label": "BBQ CHICKEN",
      "tint": "#a65421"
    },
    {
      "id": "four-cheese",
      "label": "4-CHEESE",
      "tint": "#f5e1a4"
    },
    {
      "id": "meat-lovers",
      "label": "MEAT LOVERS",
      "tint": "#8c3b1a"
    },
    {
      "id": "supreme",
      "label": "SUPREME",
      "tint": "#d96e2a"
    }
  ],
  "starterHeroIds": [
    "pepperoni",
    "margherita",
    "veggie"
  ],
  "heroUnlockPrice": 200,
  "audioMood": 0.45,
  "photoHero": true
};
