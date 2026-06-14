// Persistent character store — block-hop pattern. Owned survivors, balance,
// and the currently-selected archetype ('random' or a specific id) live in
// localStorage so they survive across runs and refreshes.

import { STARTER_SURVIVORS, SURVIVOR_IDS, type SurvivorId } from './builders/characters';

const KEY_OWNED   = 'bp_owned_chars';
const KEY_BALANCE = 'bp_balance';
const KEY_PICKED  = 'bp_selected_char';

export type Selection = 'random' | SurvivorId;

export interface StoreState {
  owned: SurvivorId[];      // ids the player has unlocked (starters always in)
  balance: number;          // score-credits available to spend
  picked: Selection;        // current loadout: 'random' rolls from owned each run
}

function parseOwned(s: string | null): SurvivorId[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return (arr as string[]).filter((x): x is SurvivorId => SURVIVOR_IDS.includes(x as SurvivorId));
  } catch { return []; }
}

export function loadStore(): StoreState {
  const owned = new Set(STARTER_SURVIVORS);
  for (const id of parseOwned(localStorage.getItem(KEY_OWNED))) owned.add(id);
  const balance = Number(localStorage.getItem(KEY_BALANCE) || 0) || 0;
  const pickedRaw = localStorage.getItem(KEY_PICKED) || 'random';
  const picked: Selection = (pickedRaw === 'random' || SURVIVOR_IDS.includes(pickedRaw as SurvivorId))
    ? (pickedRaw as Selection) : 'random';
  return { owned: Array.from(owned), balance, picked };
}

export function saveStore(s: StoreState) {
  localStorage.setItem(KEY_OWNED, JSON.stringify(s.owned));
  localStorage.setItem(KEY_BALANCE, String(Math.floor(s.balance)));
  localStorage.setItem(KEY_PICKED, s.picked);
}

// Resolve the picked selection to an actual archetype id at run start.
// 'random' rolls without replacement-priority over the entire owned set.
export function resolveSurvivor(s: StoreState): SurvivorId {
  if (s.picked !== 'random') return s.picked;
  if (s.owned.length === 0) return 'cop';   // safety: starters should always be there
  return s.owned[Math.floor(Math.random() * s.owned.length)];
}

export function buy(s: StoreState, id: SurvivorId, price: number): StoreState {
  if (s.owned.includes(id)) return s;
  if (s.balance < price) return s;
  return { ...s, owned: [...s.owned, id], balance: s.balance - price };
}

export function pick(s: StoreState, id: Selection): StoreState {
  if (id !== 'random' && !s.owned.includes(id)) return s;
  return { ...s, picked: id };
}

export function earn(s: StoreState, amount: number): StoreState {
  return { ...s, balance: s.balance + Math.max(0, Math.floor(amount)) };
}
