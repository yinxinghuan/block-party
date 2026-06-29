// Generated from: "a brave little robot defending its creator's workshop from rogue tools"
// Generated at: 2026-06-29T05:24:57.217Z
// Validation: passed

import type { CartridgeSpec } from './spec';

export const genRobotWorkshopDefenseSpec: CartridgeSpec = {
  "id": "robot-workshop-defense",
  "copy": {
    "en": {
      "title": "TOOL TACTICS",
      "subtitle": "ROBOT VS ROGUE TOOLS · AUTO-BEAM · ENDLESS WAVES",
      "introSub": "DEFEND THE WORKSHOP",
      "tapToStart": "POWER UP",
      "again": "TRY AGAIN",
      "ruleExplore": "Use the stick to move — your robot auto-fires at the nearest tool.",
      "ruleCrystals": "Collect sparks dropped by defeated tools to upgrade your systems.",
      "ruleDark": "3 lives — bosses appear every 4 waves, becoming more dangerous each time."
    },
    "zh": {
      "title": "工具战术",
      "subtitle": "机器人 vs 失控工具 · 自动射击 · 无限波次",
      "introSub": "守护工作坊",
      "tapToStart": "启动",
      "again": "再试一次",
      "ruleExplore": "摇杆移动 — 机器人自动攻击最近的工具。",
      "ruleCrystals": "击败工具获得火花，收集火花升级系统。",
      "ruleDark": "3 条命 — 每4波出现一个Boss，难度逐渐加大。"
    }
  },
  "palette": [
    {
      "name": "Morning Workshop",
      "colors": {
        "floor": "#d0d0d8",
        "fog": "#e0e4f0",
        "ambient": "#c0c4d8",
        "hemiSky": "#a8b0d0",
        "hemiGround": "#9098b8",
        "pillar": "#b0b8c8"
      }
    },
    {
      "name": "Industrial Glow",
      "colors": {
        "floor": "#8a8f9e",
        "fog": "#a0a6b8",
        "ambient": "#9096b0",
        "hemiSky": "#7076a0",
        "hemiGround": "#606890",
        "pillar": "#787f98"
      }
    },
    {
      "name": "Emergency Alert",
      "colors": {
        "floor": "#502020",
        "fog": "#703030",
        "ambient": "#803838",
        "hemiSky": "#a04040",
        "hemiGround": "#682828",
        "pillar": "#602828"
      }
    }
  ],
  "enemies": {
    "lurker": {
      "creature": "zombie",
      "name": "Rusty Wrench",
      "recolor": "#805020",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710661263-m73rpt4s8s.png"
    },
    "runner": {
      "creature": "werewolf",
      "name": "Laser Cutter",
      "recolor": "#c08040",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710668762-9uiqcq94c1f.png"
    },
    "brute": {
      "creature": "skeleton",
      "name": "Hammer Bot",
      "recolor": "#b08050",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710676547-1b4s9g2aigd.png"
    },
    "stalker": {
      "creature": "mummy",
      "name": "Screwdriver",
      "recolor": "#a08060",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710682642-zr61etdduqf.png"
    },
    "exploder": {
      "creature": "ghost",
      "name": "Spark Drone",
      "recolor": "#a0a0ff",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710689489-ypr24dcc21k.png"
    },
    "ghost": {
      "creature": "zombie",
      "name": "Pry Bar",
      "recolor": "#606060",
      "spriteUrl": "https://images.aiwaves.tech/uploads/1782710697027-xmxj7n3lfo.png"
    }
  },
  "bossLadder": [
    {
      "kind": "mech",
      "name": "Wrench Titan"
    },
    {
      "kind": "viking",
      "name": "Hammerhead"
    },
    {
      "kind": "punk",
      "name": "Laser Commander"
    },
    {
      "kind": "swat",
      "name": "Spark Swarm"
    },
    {
      "kind": "biker",
      "name": "Drill Rider"
    },
    {
      "kind": "cop",
      "name": "Screwdriver Sergeant"
    },
    {
      "kind": "firefighter",
      "name": "Flame Cutter"
    },
    {
      "kind": "goth",
      "name": "Shadow Pryer"
    },
    {
      "kind": "cowboy",
      "name": "Bolt Wrangler"
    },
    {
      "kind": "minotaur",
      "name": "Workshop Overlord"
    }
  ],
  "heroes": [
    {
      "id": "sparky",
      "label": "SPARKY",
      "tint": "#a0a8ff"
    },
    {
      "id": "tinker",
      "label": "TINKER",
      "tint": "#c08040"
    },
    {
      "id": "gear",
      "label": "GEAR",
      "tint": "#9098b8"
    },
    {
      "id": "bolt",
      "label": "BOLT",
      "tint": "#d0d0d8"
    },
    {
      "id": "cog",
      "label": "COG",
      "tint": "#807060"
    },
    {
      "id": "weld",
      "label": "WELD",
      "tint": "#a05040"
    }
  ],
  "starterHeroIds": [
    "sparky",
    "tinker",
    "gear"
  ],
  "heroUnlockPrice": 200,
  "audioMood": 0.4,
  "photoHero": true
};
