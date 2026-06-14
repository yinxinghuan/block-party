import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { createGameState, startLevel } from './hooks/useGameLoop';
import type { PickupKind, SfxKey } from './hooks/useGameLoop';
import type { SurvivorId } from './builders/characters';
import { rollPerks, type Perk } from './perks';
import { getLevelTuning, LEVELS } from './constants';
import { useJoystick } from './hooks/useJoystick';
import { playSfx, setBgmTension, setHeartbeatRate, startBgm, stopBgm, stopHeartbeat, unlockAudio } from './utils/audio';
import { t } from './i18n';
import alteruSvg from './img/alteru.svg';
import './BlockParty.less';
import './SplashScene.less';

type Phase = 'splash' | 'playing' | 'gameover';

const HIGH_KEY = 'blockParty_high';

interface Pellet { id: number; value: number; kind: PickupKind; dx: number; dy: number; }
interface Banner { id: number; kind: PickupKind; }

let pelletIdCounter = 1;
let bannerIdCounter = 1;

// Pickup banner — single line per gem type. Only `gold` is used now (every
// pickup is an XP gem); the others stay for type compatibility with the
// PickupKind union and future weapon-drop banners.
const PICKUP_INFO: Record<PickupKind, { headline: string; sub: string }> = {
  gold:  { headline: 'XP GEM', sub: '+10 score' },
  red:   { headline: '+HP',     sub: '+1 heart' },
  green: { headline: 'POWER',   sub: '5s boost' },
  blue:  { headline: 'AMMO',    sub: 'top up' },
};

export function BlockParty() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [score, setScore] = useState(0);
  const [, setDepth] = useState(0);
  const [kills, setKills] = useState(0);
  const [hp, setHp] = useState(3);
  const [selectedSurvivor, setSelectedSurvivor] = useState<SurvivorId>('cop');
  // Perk modal state — surfaces 3 random cards on level-up. The cards
  // themselves are rolled once when the modal opens so they don't shuffle
  // mid-decision.
  const [perkChoices, setPerkChoices] = useState<Perk[] | null>(null);
  // XP bar HUD readouts.
  const [xpInLevel, setXpInLevel] = useState(0);
  const [xpNeededForLevel, setXpNeededForLevel] = useState(5);
  const [xpLevel, setXpLevel] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HIGH_KEY) || 0));
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [hitFlashKey, setHitFlashKey] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  // Level intro overlay — appears briefly at the start of every level.
  const [levelTitle, setLevelTitle] = useState<{ level: number; name: string; key: number } | null>(null);
  // Level-clear overlay shown between levels with score bonus.
  const [clearOverlay, setClearOverlay] = useState<{ level: number; bonus: number; total: number } | null>(null);
  // Victory overlay shown after the final level is cleared.
  const [victory, setVictory] = useState(false);

  const stateRef = useRef(createGameState());
  const { stickRef, view } = useJoystick(phase === 'playing');

  const {
    isInAigram, submitScore, fetchLeaderboard,
  } = useGameScore();

  const haptic = useCallback((kind: 'light' | 'heavy') => {
    if (!('vibrate' in navigator)) return;
    navigator.vibrate(kind === 'heavy' ? 50 : 12);
  }, []);

  const onScore = useCallback((s: number) => setScore(s), []);
  const onDepth = useCallback((d: number) => setDepth(d), []);
  // Lantern light is gone; the prop is kept for API stability but we no
  // longer pipe it anywhere.
  const onLightRadius = useCallback((_r: number) => {}, []);

  // Two-channel pickup feedback:
  //   • Center pellet (~600ms): just "+N" near the player for instant
  //     "score went up" satisfaction
  //   • Top banner (~2.2s): full effect description with crystal icon so
  //     the player has time to read what the pickup actually did
  const onPickup = useCallback((kind: PickupKind, value: number) => {
    const pid = pelletIdCounter++;
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 30;
    setPellets(prev => [...prev, { id: pid, kind, value, dx, dy }]);
    window.setTimeout(() => setPellets(prev => prev.filter(p => p.id !== pid)), 700);

    const bid = bannerIdCounter++;
    setBanners(prev => [...prev, { id: bid, kind }]);
    window.setTimeout(() => setBanners(prev => prev.filter(b => b.id !== bid)), 2200);
  }, []);

  const onStrikeHit = useCallback(() => {
    setHitFlashKey(k => k + 1);
  }, []);

  const onGameOver = useCallback((final: number) => {
    setFinalScore(final);
    setPhase('gameover');
    stopBgm();
    if (final > highScore) {
      localStorage.setItem(HIGH_KEY, String(final));
      setHighScore(final);
    }
    submitScore(final).catch(() => { /* silent */ });
  }, [highScore, submitScore]);

  const showLevelTitle = useCallback((lvl: number) => {
    const tuning = getLevelTuning(lvl);
    setLevelTitle({ level: lvl, name: tuning.name, key: Date.now() });
    window.setTimeout(() => setLevelTitle(null), 1700);
  }, []);

  // Reshuffle the current level — re-randomizes pillars / monsters / crystals
  // / exit position and resets the timer + pickup counter. Run continues.
  const reroll = useCallback(() => {
    const d = stateRef.current;
    if (d.gameOver || victory) return;
    startLevel(d, d.level);
    setTimeLeft(getLevelTuning(d.level).timeLimit);
    setPellets([]);
    setBanners([]);
    setHeartbeatRate(0);
  }, [victory]);

  const applyPerk = useCallback((perk: Perk) => {
    const d = stateRef.current;
    perk.apply(d);
    d.perkPending = false;
    setPerkChoices(null);
  }, []);

  const start = useCallback((survivorPick?: SurvivorId) => {
    // CRITICAL: set the playing phase synchronously BEFORE touching audio.
    if (survivorPick) setSelectedSurvivor(survivorPick);
    stateRef.current = createGameState();
    setScore(0);
    setKills(0);
    setHp(3);
    setPerkChoices(null);
    setXpInLevel(0);
    setXpNeededForLevel(5);
    setXpLevel(0);
    setDepth(0);
    setLevel(1);
    setTimeLeft(getLevelTuning(1).timeLimit);
    setPellets([]);
    setBanners([]);
    setClearOverlay(null);
    setVictory(false);
    setPhase('playing');
    showLevelTitle(1);
    // Fire-and-forget audio init. If it fails or hangs, gameplay still works.
    unlockAudio().then(() => startBgm(0.18)).catch(() => { /* silent */ });
  }, [showLevelTitle]);

  useEffect(() => () => { stopBgm(); stopHeartbeat(); }, []);

  // Level state polling — drives the time-remaining HUD, the level-cleared
  // overlay between levels, and the victory state after the final level.
  useEffect(() => {
    if (phase !== 'playing') return;
    let transitioning = false;
    const id = window.setInterval(() => {
      const d = stateRef.current;
      const tuning = getLevelTuning(d.level);
      // Update the time-remaining read.
      setTimeLeft(Math.max(0, tuning.timeLimit - d.levelT));
      setLevel(d.level);
      setKills(d.kills);
      setHp(d.hp);
      setXpInLevel(d.xpInLevel);
      setXpNeededForLevel(d.xpNeededForLevel);
      setXpLevel(d.xpLevel);

      // Perk modal — open with 3 fresh cards when the loop signals a
      // pending level-up. Functional setter so we only roll once; the
      // current value isn't captured in the interval closure.
      if (d.perkPending) {
        setPerkChoices(prev => prev ?? rollPerks(3));
      }
      // Drive the BGM eerie-melody cadence from the night's tension knob.
      setBgmTension(tuning.bgmTension);

      // Level cleared → show the inter-level overlay and queue the next.
      if (d.levelCleared && !transitioning) {
        transitioning = true;
        const timeBonus = Math.max(0, Math.floor((tuning.timeLimit - d.levelT) * 5));
        const levelBonus = 100 * d.level;
        const total = Math.floor(d.score);

        if (d.victory) {
          // Final level cleared — show victory screen.
          setVictory(true);
          stopBgm();
          setFinalScore(total);
          submitScore(total).catch(() => { /* silent */ });
          if (total > highScore) {
            localStorage.setItem(HIGH_KEY, String(total));
            setHighScore(total);
          }
        } else {
          setClearOverlay({ level: d.level, bonus: levelBonus + timeBonus, total });
          window.setTimeout(() => {
            setClearOverlay(null);
            startLevel(d, d.level + 1);
            showLevelTitle(d.level);
            transitioning = false;
          }, 1900);
        }
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [phase, highScore, submitScore, showLevelTitle]);

  // Drive heartbeat tempo from monster proximity. Polls 4× per second —
  // cheap, doesn't need frame-perfect sync because the audible change is
  // a slowly-ramping BPM.
  useEffect(() => {
    if (phase !== 'playing') {
      stopHeartbeat();
      return;
    }
    const id = window.setInterval(() => {
      const d = stateRef.current;
      // Nearest zombie distance maps to BPM. >14u silent; <3u full panic.
      const dist = d.nearestMonsterDist;
      if (dist > 14) {
        setHeartbeatRate(0);
        return;
      }
      const t = Math.max(0, Math.min(1, (14 - dist) / 11));
      const bpm = 55 + t * 95;
      setHeartbeatRate(bpm);
    }, 250);
    return () => { window.clearInterval(id); stopHeartbeat(); };
  }, [phase]);

  const showCanvas = phase !== 'splash';
  const canvasFrameloop = phase === 'playing' ? 'always' : 'demand';

  return (
    <div className="ln">
      {showCanvas && (
        <div className="ln__canvas">
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} frameloop={canvasFrameloop}>
            <Scene
              state={stateRef}
              playing={phase === 'playing'}
              level={level}
              stickRef={stickRef}
              survivor={selectedSurvivor}
              onScore={onScore}
              onDepth={onDepth}
              onLightRadius={onLightRadius}
              onGameOver={onGameOver}
              onPickup={onPickup}
              onStrikeHit={onStrikeHit}
              playSfx={(k: SfxKey) => playSfx(k as never)}
              haptic={haptic}
            />
          </Canvas>
          {/* Fog-of-war overlay — radial vignette darkens everything outside
              the blockParty's reach. Anchored to screen center because the
              follow camera keeps the player centered. */}
          <div
            className="ln__fog"
            style={{
              // Much softer than before — the visible darkening only kicks
              // in past 55% of the screen radius. Previous setup compounded
              // with the 3D fog and produced the "black overlay" effect the
              // user reported, especially on phone screens.
              // City-block vignette — gentle dim at the edges, no lantern cone.
              background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.10) 78%, rgba(0,0,0,0.32) 100%)',
            }}
          />
        </div>
      )}

      {showCanvas && (
        <div className="ln__hud">
          <div className="ln__topbar">
            <div className="ln__topbar-cell">
              <span className="ln__topbar-num">{score}</span>
              <span className="ln__topbar-caption">SCORE</span>
            </div>
            <div className="ln__topbar-mid">
              <span className={`ln__topbar-num ln__topbar-num--small${timeLeft < 15 ? ' ln__topbar-num--urgent' : ''}`}>
                {Math.ceil(timeLeft)}s
              </span>
              <span className="ln__topbar-caption">TIME</span>
            </div>
            <div className="ln__topbar-cell ln__topbar-cell--right">
              <span className="ln__topbar-num ln__topbar-num--small">{kills}</span>
              <span className="ln__topbar-caption">KILLS</span>
            </div>
          </div>
          {/* Hearts — 3 max, deplete on bite. */}
          <div className="bp__hearts" aria-label={`${hp} of 3 hearts`}>
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className={`bp__heart${i < hp ? '' : ' bp__heart--gone'}`}
                aria-hidden="true"
              >♥</span>
            ))}
          </div>

          {/* XP bar — fills as gems get hoovered up. Level number sits at
              the left, fill % sits behind the track. */}
          <div className="bp__xp">
            <span className="bp__xp-level">LVL {xpLevel}</span>
            <div className="bp__xp-track" aria-label={`xp ${xpInLevel} of ${xpNeededForLevel}`}>
              <div
                className="bp__xp-fill"
                style={{ width: `${Math.min(100, (xpInLevel / Math.max(1, xpNeededForLevel)) * 100)}%` }}
              />
            </div>
          </div>
          {/* Night pill — sits under the topbar so the player always knows
              which night they're on. */}
          <div className="ln__level-pill">
            <span className="ln__level-pill-num">N{level}</span>
            <span className="ln__level-pill-name">{getLevelTuning(level).name}</span>
          </div>
          {/* Reroll — reshuffle the current night's layout if the player
              doesn't like the spawn or pillar placement. Run continues. */}
          <button className="ln__reroll-btn" onPointerDown={reroll}>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
              <path d="M4 12 A 8 8 0 0 1 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M14 4 L 19 7 L 16 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 12 A 8 8 0 0 1 5 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M10 20 L 5 17 L 8 13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>RESHUFFLE LEVEL</span>
          </button>
        </div>
      )}

      {showCanvas && <img className="ln__watermark" src={alteruSvg} alt="AlterU" />}

      {/* Floating "+N" — instant satisfaction near the player */}
      {phase === 'playing' && pellets.length > 0 && (
        <div className="ln__pellets">
          {pellets.map(p => (
            <div
              key={p.id}
              className={`ln__pellet ln__pellet--${p.kind}`}
              style={{ left: `${p.dx}px`, top: `${p.dy}px` }}
            >
              +{p.value}
            </div>
          ))}
        </div>
      )}

      {/* Pickup effect banner — slides in below the HUD, holds for ~1.6s,
          fades out. Tells the player what the pickup actually does. */}
      {phase === 'playing' && banners.length > 0 && (
        <div className="ln__banners">
          {banners.map((b, i) => {
            const info = PICKUP_INFO[b.kind];
            return (
              <div key={b.id} className={`ln__banner ln__banner--${b.kind}`} style={{ marginTop: i === 0 ? 0 : 4 }}>
                <span className="ln__banner-dot" />
                <div className="ln__banner-text">
                  <span className="ln__banner-headline">{info.headline}</span>
                  <span className="ln__banner-sub">{info.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Red strike flash — one-shot full-screen pulse when a dark hand grabs */}
      {hitFlashKey > 0 && <div key={hitFlashKey} className="ln__hit-flash" />}

      {view.active && (
        <div className="ln__joystick" style={{ left: view.ox, top: view.oy }}>
          <div className="ln__joystick__ring">
            <div className="ln__joystick__stick" style={{ transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))` }} />
          </div>
        </div>
      )}

      {phase === 'splash' && <SplashScene onStart={start} highScore={highScore} />}

      {/* Night intro — brief overlay at start of each night */}
      {phase === 'playing' && levelTitle && (
        <div className="ln__level-intro" key={levelTitle.key}>
          <div className="ln__level-intro-num">NIGHT {levelTitle.level}</div>
          <div className="ln__level-intro-name">{levelTitle.name}</div>
          <div className="ln__level-intro-sub">SURVIVE 45 SECONDS</div>
        </div>
      )}

      {/* Night cleared — between-night overlay */}
      {phase === 'playing' && clearOverlay && (
        <div className="ln__level-clear">
          <div className="ln__level-clear-eyebrow">NIGHT {clearOverlay.level} CLEARED</div>
          <div className="ln__level-clear-bonus">+{clearOverlay.bonus}</div>
          <div className="ln__level-clear-total">TOTAL · {clearOverlay.total}</div>
          <div className="ln__level-clear-next">Lock the door. Reload.</div>
        </div>
      )}

      {/* Victory — shown after the final night is cleared */}
      {phase === 'playing' && victory && (
        <div className="ln__victory">
          <div className="ln__victory-eyebrow">DAWN BROKE</div>
          <div className="ln__final-score">{finalScore}</div>
          <div className="ln__final">SURVIVED ALL {LEVELS.length} NIGHTS</div>
          <button className="ln__cta" onPointerDown={() => start()}>
            {t('again')}
          </button>
          <button className="ln__leaderboard-btn" onPointerDown={() => setShowLeaderboard(true)}>
            {t('leaderboard')}
          </button>
        </div>
      )}

      {phase === 'gameover' && !victory && (
        <div className="ln__gameover">
          <div className="ln__gameover-eyebrow">
            {finalScore > 0 && finalScore === highScore ? 'NEW RECORD' : 'BITTEN'}
          </div>
          <div className="ln__final-score">{finalScore}</div>
          <div className="ln__final">FELL ON NIGHT {level} · {getLevelTuning(level).name.toUpperCase()}</div>
          <button className="ln__cta" onPointerDown={() => start()}>
            {t('again')}
          </button>
          <button className="ln__leaderboard-btn" onPointerDown={() => setShowLeaderboard(true)}>
            {t('leaderboard')}
          </button>
        </div>
      )}

      {showLeaderboard && (
        <Leaderboard
          gameName={t('title')}
          isInAigram={isInAigram}
          onClose={() => setShowLeaderboard(false)}
          fetch={fetchLeaderboard}
        />
      )}

      {/* Perk modal — pauses the loop (d.perkPending). Three cards rolled
          fresh on each level-up; the player picks one and the loop
          resumes. */}
      {perkChoices && (
        <div className="bp__perk-overlay">
          <div className="bp__perk-eyebrow">LEVEL UP · {xpLevel}</div>
          <div className="bp__perk-title">PICK A PERK</div>
          <div className="bp__perk-cards">
            {perkChoices.map(perk => (
              <button
                key={perk.id}
                className="bp__perk-card"
                style={{ ['--perk-tint' as string]: perk.tint }}
                onPointerDown={() => applyPerk(perk)}
              >
                <div className="bp__perk-card-label">{perk.label}</div>
                <div className="bp__perk-card-desc">{perk.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
