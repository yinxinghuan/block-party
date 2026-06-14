// Pure SVG/CSS splash. No 3D Canvas → safe to mount during preload.
// Theme: a dark cave mouth. Stalactites hang from the top, stalagmites
// rise from the bottom, two drifting particle layers add life (warm
// embers rising + cool firefly motes meandering), and a warm glow at the
// bottom hints at a blockParty just out of frame. The CTA mirrors the
// in-game amber/blockParty palette.
import { useState } from 'react';
import { t } from '../i18n';
import { SURVIVOR_META, type SurvivorId } from '../builders/characters';
import type { Selection } from '../store';

// Small octahedron-style crystal icon for the splash how-to-play row.
// Diamond outline + inner gradient give it the same "facet" read as the
interface Speck {
  id: number;
  x: number;       // 0..100 (%)
  delay: number;   // s
  duration: number;
  size: number;
}

export interface SplashSceneProps {
  onStart: () => void;
  onOpenStore: () => void;
  highScore: number;
  picked: Selection;
  balance: number;
}

export function SplashScene({ onStart, onOpenStore, highScore, picked, balance }: SplashSceneProps) {
  // Two particle layers — warm embers drifting up, cool fireflies meandering.
  const [embers] = useState<Speck[]>(() =>
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: -Math.random() * 9,
      duration: 9 + Math.random() * 7,
      size: 2 + Math.random() * 3,
    }))
  );
  const [motes] = useState<Speck[]>(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: -Math.random() * 12,
      duration: 14 + Math.random() * 10,
      size: 3 + Math.random() * 4,
    }))
  );

  return (
    <div className="ln-splash">
      {/* Cave void — deep blue-black with a warm glow welling up from the
          bottom to suggest a blockParty just below frame. */}
      <div className="ln-splash__void" />
      <div className="ln-splash__warm-glow" />

      {/* Drifting embers — warm orange specks rising from the bottom */}
      <div className="ln-splash__embers">
        {embers.map(f => (
          <div
            key={f.id}
            className="ln-splash__ember"
            style={{
              left: `${f.x}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Firefly motes — cool blue points wandering slowly */}
      <div className="ln-splash__motes">
        {motes.map(f => (
          <div
            key={f.id}
            className="ln-splash__mote"
            style={{
              left: `${f.x}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Stalactite silhouettes — irregular spikes hanging from the cave roof.
          A subtle drift gives the back layer parallax. */}
      <div className="ln-splash__stalactites ln-splash__stalactites--back">
        <svg viewBox="0 0 1200 220" preserveAspectRatio="none" width="200%" height="100%">
          <polygon fill="#1a1014" points="0,0 0,80 70,0" />
          <polygon fill="#1a1014" points="80,0 130,140 180,0" />
          <polygon fill="#1a1014" points="200,0 260,100 320,0" />
          <polygon fill="#1a1014" points="340,0 410,180 480,0" />
          <polygon fill="#1a1014" points="500,0 555,120 610,0" />
          <polygon fill="#1a1014" points="630,0 700,160 770,0" />
          <polygon fill="#1a1014" points="790,0 840,90 890,0" />
          <polygon fill="#1a1014" points="910,0 980,170 1050,0" />
          <polygon fill="#1a1014" points="1070,0 1130,100 1200,0 1200,0" />
        </svg>
      </div>
      <div className="ln-splash__stalactites ln-splash__stalactites--front">
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" width="100%" height="100%">
          <polygon fill="#0a0608" points="0,0 0,60 50,0" />
          <polygon fill="#0a0608" points="60,0 110,180 160,0" />
          <polygon fill="#0a0608" points="180,0 240,110 300,0" />
          <polygon fill="#0a0608" points="320,0 390,200 460,0" />
          <polygon fill="#0a0608" points="480,0 540,130 600,0" />
          <polygon fill="#0a0608" points="620,0 690,190 760,0" />
          <polygon fill="#0a0608" points="780,0 800,80 800,0" />
        </svg>
      </div>

      {/* Stalagmite silhouettes — irregular humps rising from the cave floor */}
      <div className="ln-splash__stalagmites">
        <svg viewBox="0 0 800 180" preserveAspectRatio="none" width="100%" height="100%">
          <polygon fill="#0a0608" points="0,180 0,140 60,80 120,180" />
          <polygon fill="#0a0608" points="120,180 180,110 260,40 340,180" />
          <polygon fill="#0a0608" points="340,180 400,100 480,150 560,180" />
          <polygon fill="#0a0608" points="560,180 620,60 700,120 800,180" />
        </svg>
      </div>

      {/* Foreground content */}
      <div className="ln-splash__content">
        <h1 className="ln-splash__title">
          <span className="ln-splash__title-emph">BLOCK</span>{' '}
          <span className="ln-splash__title-emph ln-splash__title-emph--accent">PARTY</span>
        </h1>
        <p className="ln-splash__subtitle">{t('subtitle')}</p>

        {highScore > 0 && (
          <div className="ln-splash__best">
            <span className="ln-splash__best-label">BEST</span>
            <span className="ln-splash__best-value">{highScore}</span>
          </div>
        )}

        {/* How-to-play card — 3 lines, one per moving part. */}
        <div className="ln-splash__rules">
          <div className="ln-splash__rule-line">{t('rule_explore')}</div>
          <div className="ln-splash__rule-line">{t('rule_crystals')}</div>
          <div className="ln-splash__rules-warn">{t('rule_dark')}</div>
        </div>

        {/* Active loadout chip — shows the currently selected survivor (or
            RANDOM if the player hasn't pinned one). Tapping opens the
            store; the BIG button beneath is the only thing needed to
            start a run. */}
        <button
          className="ln-splash__loadout"
          style={{
            ['--shift-tint' as string]: picked === 'random'
              ? '#ffd060'
              : SURVIVOR_META[picked as SurvivorId].tint,
          }}
          onPointerDown={onOpenStore}
        >
          <span className="ln-splash__loadout-label">PLAYING AS</span>
          <span className="ln-splash__loadout-dot" />
          <span className="ln-splash__loadout-name">
            {picked === 'random' ? 'RANDOM' : SURVIVOR_META[picked as SurvivorId].label}
          </span>
          <span className="ln-splash__loadout-edit">↺</span>
        </button>

        <button className="ln-splash__cta" onPointerDown={onStart}>
          <span className="ln-splash__cta-text">{t('tap_to_start')}</span>
          <span className="ln-splash__cta-pulse" aria-hidden />
        </button>

        <button className="ln-splash__store-link" onPointerDown={onOpenStore}>
          STORE · ${Math.floor(balance)}
        </button>
      </div>
    </div>
  );
}
