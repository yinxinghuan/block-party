// Perk pool — surfaced on the level-up modal. Each card carries a label,
// a one-line description, an accent tint that matches its archetype on
// the modal, and an apply(d) closure that mutates the player's perk
// multipliers directly. Modal pauses the loop while open (see
// useGameLoop d.perkPending), so applying mid-frame is fine.

import type { GameRef } from './hooks/useGameLoop';

export interface Perk {
  id: string;
  label: string;
  description: string;
  tint: string;
  apply: (d: GameRef) => void;
}

export const PERKS: Perk[] = [
  {
    id: 'fire-rate',
    label: 'FAST HANDS',
    description: '+25% fire rate',
    tint: '#ffce4a',
    apply: d => { d.perkFireRateMul *= 0.80; },
  },
  {
    id: 'damage',
    label: 'HEAVY ROUNDS',
    description: '+25% damage',
    tint: '#ff7a4a',
    apply: d => { d.perkDmgMul *= 1.25; },
  },
  {
    id: 'projectile',
    label: '+1 BULLET',
    description: 'One more projectile per shot',
    tint: '#9bd3ff',
    apply: d => { d.perkExtraProjectiles += 1; },
  },
  {
    id: 'pierce',
    label: 'PIERCE',
    description: 'Bullets punch through +1 enemy',
    tint: '#cf8aff',
    apply: d => { d.perkPierce += 1; },
  },
  {
    id: 'crit',
    label: 'HEADSHOT',
    description: '+15% crit chance (×2 damage)',
    tint: '#ff5870',
    apply: d => { d.perkCritChance = Math.min(1, d.perkCritChance + 0.15); },
  },
  {
    id: 'magnet',
    label: 'MAGNET',
    description: '+30% XP gem pull radius',
    tint: '#7fffa8',
    apply: d => { d.perkMagnetMul *= 1.30; },
  },
  {
    id: 'speed',
    label: 'SPRINT',
    description: '+12% move speed',
    tint: '#7eccff',
    apply: d => { d.perkSpeedMul *= 1.12; },
  },
  {
    id: 'lifesteal',
    label: 'BLOODY GOOD',
    description: '+8% chance to heal on kill',
    tint: '#ff8aa0',
    apply: d => { d.perkKillHealChance = Math.min(1, d.perkKillHealChance + 0.08); },
  },
];

// Lookup by id — used to apply a perk picked up off the street.
const PERK_BY_ID = new Map(PERKS.map(p => [p.id, p]));
export function getPerk(id: string): Perk | undefined { return PERK_BY_ID.get(id); }

// Roll a single random perk — used when a perk drop spawns. Each perk is
// equally likely; no bias yet.
export function rollOnePerk(): Perk {
  return PERKS[Math.floor(Math.random() * PERKS.length)];
}
