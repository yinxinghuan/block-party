// Generated from: "a chef defending their kitchen from sentient vegetables"
// Generated at: 2026-06-28T20:40:28.485Z
// Validation: passed

import type { CartridgeSpec } from './spec';

export const genChefVegetableDefenseSpec: CartridgeSpec = {
  "id": "chef-vegetable-defense",
  "copy": {
    "en": {
      "title": "KITCHEN FURY",
      "subtitle": "CHEF VS SENTIENT VEGGIES · AUTO-CHOP · ENDLESS WAVES",
      "introSub": "DEFEND YOUR KITCHEN",
      "tapToStart": "START COOKING",
      "again": "COOK AGAIN",
      "ruleExplore": "Move with the stick — your chef auto-chops the nearest veggie.",
      "ruleCrystals": "Collect fallen ingredient shards to boost your cooking power.",
      "ruleDark": "3 lives. Endless waves — a boss veggie appears every 5 waves, getting tougher."
    },
    "zh": {
      "title": "厨房狂怒",
      "subtitle": "厨师 vs 有意识的蔬菜 · 自动砍杀 · 无限波次",
      "introSub": "守护你的厨房",
      "tapToStart": "开始烹饪",
      "again": "再来一锅",
      "ruleExplore": "摇杆移动 · 厨师自动砍向最近的蔬菜",
      "ruleCrystals": "收集掉落的食材碎片提升烹饪力量",
      "ruleDark": "3条命 · 每5波出现一只蔬菜Boss，越来越难"
    }
  },
  "palette": [
    {
      "name": "Fresh Morning Kitchen",
      "colors": {
        "floor": "#f5f0e6",
        "fog": "#faf8f5",
        "ambient": "#fff9f0",
        "hemiSky": "#fff3d4",
        "hemiGround": "#d6cdb7",
        "pillar": "#cbbf91"
      }
    },
    {
      "name": "Rising Heat",
      "colors": {
        "floor": "#e9d5c3",
        "fog": "#f9ebe3",
        "ambient": "#ffd6a5",
        "hemiSky": "#ffb347",
        "hemiGround": "#b78b5e",
        "pillar": "#c69c6d"
      }
    },
    {
      "name": "Fiery Kitchen Night",
      "colors": {
        "floor": "#8b3e2f",
        "fog": "#4a2b20",
        "ambient": "#ff7043",
        "hemiSky": "#ff3d00",
        "hemiGround": "#663926",
        "pillar": "#7a4a35"
      }
    }
  ],
  "enemies": {
    "lurker": {
      "creature": "zombie",
      "name": "Rotten Tomato",
      "recolor": "#a83232"
    },
    "runner": {
      "creature": "werewolf",
      "name": "Sneaky Carrot",
      "recolor": "#ff9f1c"
    },
    "brute": {
      "creature": "skeleton",
      "name": "Broccoli Beast",
      "recolor": "#3a7d44"
    },
    "stalker": {
      "creature": "mummy",
      "name": "Creeping Onion",
      "recolor": "#d9c9a1"
    },
    "exploder": {
      "creature": "ghost",
      "name": "Spicy Chili",
      "recolor": "#ff4500"
    },
    "ghost": {
      "creature": "zombie",
      "name": "Mushroom Menace",
      "recolor": "#a8a392"
    }
  },
  "bossLadder": [
    {
      "kind": "vampire",
      "name": "King Cauliflower"
    },
    {
      "kind": "swat",
      "name": "Garlic Grenadier"
    },
    {
      "kind": "mech",
      "name": "Pumpkin Paladin"
    },
    {
      "kind": "minotaur",
      "name": "Cabbage Crusher"
    },
    {
      "kind": "viking",
      "name": "Radish Raider"
    },
    {
      "kind": "punk",
      "name": "Pepper Punk"
    },
    {
      "kind": "cop",
      "name": "Leek Lawman"
    },
    {
      "kind": "cowboy",
      "name": "Eggplant Outlaw"
    },
    {
      "kind": "goth",
      "name": "Black Garlic Shade"
    },
    {
      "kind": "biker",
      "name": "Zucchini Rider"
    }
  ],
  "heroes": [
    {
      "id": "chef-antonio",
      "label": "ANTONIO",
      "tint": "#d2691e"
    },
    {
      "id": "chef-maya",
      "label": "MAYA",
      "tint": "#f4a460"
    },
    {
      "id": "chef-li",
      "label": "LI",
      "tint": "#deb887"
    },
    {
      "id": "chef-rosa",
      "label": "ROSA",
      "tint": "#cd5c5c"
    },
    {
      "id": "chef-nina",
      "label": "NINA",
      "tint": "#a0522d"
    },
    {
      "id": "chef-otto",
      "label": "OTTO",
      "tint": "#b87333"
    }
  ],
  "starterHeroIds": [
    "chef-antonio",
    "chef-maya",
    "chef-li"
  ],
  "heroUnlockPrice": 200,
  "audioMood": 0.5,
  "photoHero": true
};
