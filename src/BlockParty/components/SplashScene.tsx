// Live splash — the real 3D scene shows behind this layer (BlockParty.tsx
// keeps the Canvas mounted with playing=false). The overlay is a few small
// chips + a phantom-thumb gesture hint. First touch outside the chips
// activates the joystick → the parent flips phase to 'playing' and the
// run begins. No CTA button.
import type { PointerEvent } from 'react';
import { CARTRIDGE } from '../cartridge';
import type { Selection } from '../store';

export interface SplashSceneProps {
  onOpenStore: () => void;
  onOpenLeaderboard: () => void;
  highScore: number;
  picked: Selection;
  champion: { name: string; score: number } | null;
}

// Buttons must stop the native pointerdown from reaching the window-level
// joystick listener — otherwise tapping a chip would also start the game.
function stop(e: PointerEvent) { e.nativeEvent.stopPropagation(); }

function titleLines(title: string): [string, string] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return [words[0], words.slice(1).join(' ')];
  const only = words[0] ?? title.trim();
  const cut = Math.max(1, Math.ceil(only.length / 2));
  return [only.slice(0, cut), only.slice(cut)];
}

export function SplashScene({ onOpenStore, onOpenLeaderboard, highScore, picked, champion }: SplashSceneProps) {
  const survivorLabel = picked === 'random'
    ? 'RANDOM'
    : (CARTRIDGE.heroes.find(h => h.id === picked)?.label ?? 'RANDOM');
  const [titleTop, titleBottom] = titleLines(CARTRIDGE.copy.en.title);

  return (
    <div className="bp-splash">
      {/* Title — cartridge-driven wordmark anchored top-center. */}
      <div className="bp-splash__title">
        <span className="bp-splash__title-mark bp-splash__title-mark--primary">{titleTop}</span>
        {titleBottom && (
          <span className="bp-splash__title-mark bp-splash__title-mark--accent">{titleBottom}</span>
        )}
      </div>

      {/* Top-left: loadout chip → store */}
      <button
        className="bp-splash__chip bp-splash__chip--loadout"
        onPointerDown={(e) => { stop(e); onOpenStore(); }}
      >
        <span className="bp-splash__chip-eyebrow">PLAYING AS</span>
        <span className="bp-splash__chip-name">{survivorLabel}</span>
        <span className="bp-splash__chip-edit">↺</span>
      </button>

      {/* Top-right: champion pill — populated once leaderboard top entry is
          known. Empty form falls back to a plain LEADERBOARD pill. */}
      {champion ? (
        <button
          className="bp-splash__champion"
          onPointerDown={(e) => { stop(e); onOpenLeaderboard(); }}
        >
          <span className="bp-splash__champion-trophy" aria-hidden>★</span>
          <span className="bp-splash__champion-name">{champion.name}</span>
          <span className="bp-splash__champion-score">{champion.score.toLocaleString()}</span>
        </button>
      ) : (
        <button
          className="bp-splash__champion bp-splash__champion--empty"
          onPointerDown={(e) => { stop(e); onOpenLeaderboard(); }}
        >
          <span className="bp-splash__champion-trophy" aria-hidden>★</span>
          <span>LEADERS</span>
        </button>
      )}

      {/* High-score line below the title */}
      {highScore > 0 && (
        <div className="bp-splash__best">YOUR BEST · {highScore.toLocaleString()}</div>
      )}

      {/* Gesture demo — phantom thumb circling the would-be joystick center.
          Pointer-events: none so the touch lands on the underlying canvas
          and the window pointerdown listener can pick it up. */}
      <div className="bp-splash__demo" aria-hidden>
        <div className="bp-splash__demo-ring">
          <div className="bp-splash__demo-thumb" />
        </div>
        <div className="bp-splash__demo-label">DRAG ANYWHERE TO WALK</div>
      </div>
    </div>
  );
}
