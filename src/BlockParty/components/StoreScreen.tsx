// Store — pick a survivor to play as, or unlock a locked one with your
// accumulated score-credits. Tap RANDOM to roll from your owned roster
// each run. Cards mirror the splash chip styling.

import { CARTRIDGE, type HeroId } from '../cartridge';
import { buy, pick, type Selection, type StoreState } from '../store';

const UNLOCK_PRICE = CARTRIDGE.heroUnlockPrice;

export interface StoreScreenProps {
  state: StoreState;
  onChange: (s: StoreState) => void;
  onClose: () => void;
  /** Identity hero — shown only when the active cartridge supports a photo hero.
   *  `active` reflects whether a face is currently set; `onToggle` sets/clears it. */
  photoHero?: { active: boolean; onToggle: () => void };
}

export function StoreScreen({ state, onChange, onClose, photoHero }: StoreScreenProps) {
  const handlePick = (sel: Selection) => onChange(pick(state, sel));
  const handleBuy = (id: HeroId) => onChange(buy(state, id, UNLOCK_PRICE));

  return (
    <div className="bp-store">
      <div className="bp-store__topbar">
        <button className="bp-store__back" onPointerDown={onClose}>← BACK</button>
        <div className="bp-store__balance">${Math.floor(state.balance)}</div>
      </div>

      <div className="bp-store__title">PICK YOUR SHIFT</div>
      <div className="bp-store__subtitle">unlock with score · random rolls from owned</div>

      {/* RANDOM card always at top */}
      <div className="bp-store__grid">
        {/* Identity hero — "play as me" maps the player's face onto the body.
            Overrides the archetype while active. */}
        {photoHero && (
          <button
            className={`bp-store__card${photoHero.active ? ' is-active' : ''}`}
            style={{ ['--card-tint' as string]: '#7ad0ff' }}
            onPointerDown={photoHero.onToggle}
          >
            <div className="bp-store__card-dot bp-store__card-dot--random">★</div>
            <div className="bp-store__card-name">ME</div>
            <div className="bp-store__card-state">{photoHero.active ? 'IN USE' : 'USE PHOTO'}</div>
          </button>
        )}

        <button
          className={`bp-store__card${state.picked === 'random' ? ' is-active' : ''}`}
          style={{ ['--card-tint' as string]: '#ffd060' }}
          onPointerDown={() => handlePick('random')}
        >
          <div className="bp-store__card-dot bp-store__card-dot--random">?</div>
          <div className="bp-store__card-name">RANDOM</div>
          <div className="bp-store__card-state">
            {state.picked === 'random' ? 'IN USE' : 'TAP'}
          </div>
        </button>

        {CARTRIDGE.heroes.map(hero => {
          const id = hero.id;
          const m = { label: hero.label, tint: hero.tint };
          const owned = state.owned.includes(id);
          const active = state.picked === id;
          const affordable = state.balance >= UNLOCK_PRICE;
          const tap = owned
            ? () => handlePick(active ? 'random' : id)
            : (affordable ? () => handleBuy(id) : undefined);
          const stateLabel = active ? 'IN USE'
            : owned ? 'TAP'
            : affordable ? `BUY $${UNLOCK_PRICE}`
            : `$${UNLOCK_PRICE}`;
          return (
            <button
              key={id}
              className={
                'bp-store__card'
                + (active ? ' is-active' : '')
                + (!owned && !affordable ? ' is-locked' : '')
              }
              style={{ ['--card-tint' as string]: m.tint }}
              onPointerDown={tap}
              disabled={!owned && !affordable}
            >
              <div className="bp-store__card-dot" />
              <div className="bp-store__card-name">{m.label}</div>
              <div className="bp-store__card-state">{stateLabel}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
