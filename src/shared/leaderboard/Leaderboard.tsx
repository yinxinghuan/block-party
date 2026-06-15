import { useEffect, useState } from 'react';
import { openAigramProfile } from '../runtime/bridge';
import type { LeaderboardEntry } from './useGameScore';
import './Leaderboard.less';

// ─── Built-in i18n (no dependency on game's i18n) ────────────────────────

const STRINGS = {
  zh: {
    title: '排行榜',
    me: '我',
    empty: '暂无记录，快来第一个上榜！',
  },
  en: {
    title: 'Leaderboard',
    me: 'me',
    empty: 'No records yet. Be the first!',
  },
} as const;

function detectLang(): 'zh' | 'en' {
  try {
    const override = localStorage.getItem('game_locale');
    if (override === 'zh' || override === 'en') return override;
  } catch { /* ignore */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const s = STRINGS[detectLang()];

// ─── Sub-components ───────────────────────────────────────────────────────

function Avatar({ url, name, size = 40 }: { url: string; name: string; size?: number }) {
  return (
    <div className="lb-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {url
        ? <img src={url} alt={name} draggable={false} />
        : <span>{name.charAt(0).toUpperCase()}</span>
      }
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  gameName: string;
  isInAigram: boolean;
  onClose: () => void;
  fetch: () => Promise<LeaderboardEntry[]>;
}

// Crossy Road / comic-book look — a single gold crown SVG marks rank 1
// instead of platform-emoji medals. Ranks 2-50 just show their number in
// ink, which keeps the row read tight and the page feeling printed.
function Crown() {
  return (
    <svg className="lb-crown" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 8 L7 13 L12 6 L17 13 L21 8 L20 18 L4 18 Z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Leaderboard({ gameName, isInAigram, onClose, fetch }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch()
      .then(data => { if (alive) setEntries(data); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetch]);

  return (
    <div className="lb-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lb-panel">

        {/* Header */}
        <div className="lb-header">
          <div className="lb-header__left">
            <span className="lb-header__icon">🏆</span>
            <div>
              <div className="lb-header__title">{s.title}</div>
              <div className="lb-header__game">{gameName}</div>
            </div>
          </div>
          <button className="lb-close" onPointerDown={onClose}>✕</button>
        </div>

        {/* List */}
        <div className="lb-body">
          {loading && (
            <div className="lb-state">
              <span className="lb-spinner" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="lb-state">
              <span className="lb-state__icon">🎮</span>
              <span className="lb-state__text">{s.empty}</span>
            </div>
          )}

          {!loading && entries.map((entry, i) => (
            <div
              key={entry.user_id}
              className={`lb-row ${entry.isMe ? 'lb-row--me' : ''} ${i === 0 ? 'lb-row--top1' : ''} ${isInAigram ? 'lb-row--clickable' : ''}`}
              onClick={isInAigram ? () => openAigramProfile(entry.user_id) : undefined}
            >
              <div className="lb-row__rank">
                {i === 0 && <Crown />}
                <span className="lb-row__num">#{i + 1}</span>
              </div>

              <Avatar url={entry.avatar_url} name={entry.name} size={i === 0 ? 36 : 32} />

              <div className="lb-row__info">
                <span className="lb-row__name">{entry.name}</span>
                {entry.isMe && <span className="lb-row__me">{s.me}</span>}
              </div>

              <span className="lb-row__score">{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
