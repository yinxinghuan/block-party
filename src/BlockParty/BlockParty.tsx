import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import type { LeaderboardEntry } from '@shared/leaderboard';
import { useGameEvent, telegramId } from '@shared/runtime';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { StoreScreen } from './components/StoreScreen';
import { loadStore, saveStore, earn, resolveSurvivor, type StoreState } from './store';
import { createGameState, startLevel } from './hooks/useGameLoop';
import type { PickupKind, SfxKey } from './hooks/useGameLoop';
import type { SurvivorId } from './builders/characters';
import { WEAPONS, type WeaponId } from './builders/weapons';
import { PERKS } from './perks';
import { NIGHT_KILL_GOAL } from './constants';
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
  // Persistent store — owned chars, balance, current pick. Synced to
  // localStorage on every mutation.
  const [storeState, setStoreStateRaw] = useState<StoreState>(() => loadStore());
  const [storeOpen, setStoreOpen] = useState(false);
  const setStoreState = useCallback((s: StoreState) => {
    setStoreStateRaw(s);
    saveStore(s);
  }, []);
  // Perk toast — fades after a few seconds. Set on every perk-drop
  // pickup. The actual perk is auto-applied by the game loop.
  const [perkToast, setPerkToast] = useState<{ id: string; key: number } | null>(null);
  // XP bar HUD readouts.
  const [xpInLevel, setXpInLevel] = useState(0);
  const [xpNeededForLevel, setXpNeededForLevel] = useState(5);
  const [xpLevel, setXpLevel] = useState(0);
  const [currentWeaponId, setCurrentWeaponId] = useState<WeaponId>('pistol');
  const [currentWeaponLevel, setCurrentWeaponLevel] = useState(1);
  const [weaponToast, setWeaponToast] = useState<{ id: WeaponId; level: number; kind: 'swap' | 'levelup'; key: number } | null>(null);
  // Exit-goal HUD: kill progress toward the night's exit + a one-shot
  // "EXIT OPEN" toast the moment the beacon spawns.
  const [killsThisNight, setKillsThisNight] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitToastKey, setExitToastKey] = useState(0);
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
  // Joystick is live on splash too — first drag flips phase to playing
  // (see the splash→start effect below).
  const { stickRef, view } = useJoystick(phase === 'playing' || phase === 'splash');

  const {
    isInAigram, submitScore, fetchLeaderboard,
  } = useGameScore();
  const events = useGameEvent();

  // Champion pill on splash + leaderboard-beat notify ([[aigram-notify]]
  // skill, Reference Implementation B). On splash, refetch the board and
  // pin the top entry. Snapshot my own pre-run best when entering a run;
  // after submit, if this run pushed me ahead of anyone, ping the highest
  // scorer I just overtook.
  const [champion, setChampion] = useState<{ name: string; score: number } | null>(null);
  const preRunBestRef = useRef(0);
  const lastRowsRef = useRef<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (phase !== 'splash') return;
    let cancelled = false;
    fetchLeaderboard()
      .then(rows => {
        if (cancelled) return;
        lastRowsRef.current = rows;
        const top = rows[0];
        if (top && Number(top.score) > 0) {
          setChampion({ name: top.name || 'anon', score: Number(top.score) });
        } else {
          setChampion(null);
        }
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [phase, fetchLeaderboard]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (!telegramId) { preRunBestRef.current = 0; return; }
    const meId = String(telegramId);
    const me = lastRowsRef.current.find(r => String(r.user_id) === meId);
    preRunBestRef.current = me ? Number(me.score) || 0 : 0;
  }, [phase]);

  const sendBeatNotify = useCallback(async (myScore: number) => {
    if (!telegramId || !events.canEmit) return;
    if (myScore <= preRunBestRef.current) return;
    try {
      const fresh = await fetchLeaderboard();
      const meId = String(telegramId);
      const beaten = fresh
        .filter(r => String(r.user_id) !== meId)
        .map(r => ({ id: String(r.user_id), score: Number(r.score) || 0 }))
        .filter(r => r.score < myScore && r.score > preRunBestRef.current)
        .sort((a, b) => b.score - a.score)[0];
      if (!beaten) return;
      events.trigger('score_beat', {
        actions: [
          {
            type: 'notify',
            target_user_id: beaten.id,
            image: {
              ref_url: 'https://yinxinghuan.github.io/games/posters/block-party.png',
              prompt: 'neon-lit night street with cops and zombies, top-down arcade shooter',
            },
            message: {
              template: `{sender_name} just beat your record — ${Math.round(myScore)} on BLOCK PARTY.`,
              variables: ['sender_name'],
            },
          },
        ],
      });
    } catch { /* silent */ }
  }, [events, fetchLeaderboard]);

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
    submitScore(final)
      .then(() => sendBeatNotify(final))
      .catch(() => { /* silent */ });
    // Earn the run's score as store currency.
    setStoreState(earn(storeState, final));
  }, [highScore, submitScore, storeState, setStoreState, sendBeatNotify]);

  const showLevelTitle = useCallback((lvl: number) => {
    const tuning = getLevelTuning(lvl);
    setLevelTitle({ level: lvl, name: tuning.name, key: Date.now() });
    window.setTimeout(() => setLevelTitle(null), 1700);
  }, []);

  const start = useCallback((survivorPick?: SurvivorId) => {
    // CRITICAL: set the playing phase synchronously BEFORE touching audio.
    // Resolve which survivor to play as: explicit pick wins, else the
    // store's picked selection (with random→roll handled in store.ts).
    const resolved = survivorPick ?? resolveSurvivor(storeState);
    setSelectedSurvivor(resolved);
    stateRef.current = createGameState();
    setScore(0);
    setKills(0);
    setHp(3);
    setPerkToast(null);
    setKillsThisNight(0);
    setExitOpen(false);
    setXpInLevel(0);
    setXpNeededForLevel(5);
    setXpLevel(0);
    setCurrentWeaponId('pistol');
    setCurrentWeaponLevel(1);
    setWeaponToast(null);
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
      setCurrentWeaponId(d.currentWeaponId);
      setCurrentWeaponLevel(d.currentWeaponLevel);
      setKillsThisNight(d.killsThisNight);
      setExitOpen(!!d.exit);
      if (d.exitJustOpened) {
        d.exitJustOpened = false;
        setExitToastKey(k => k + 1);
      }
      if (d.lastWeaponPickupKind) {
        const ts = d.lastWeaponPickupAt;
        setWeaponToast(prev => (prev && prev.key === ts ? prev : {
          id: d.currentWeaponId,
          level: d.currentWeaponLevel,
          kind: d.lastWeaponPickupKind!,
          key: ts,
        }));
      }

      // Perk modal — open with 3 fresh cards when the loop signals a
      // Perk toast — pop a fresh toast whenever the loop records a new
      // perk pickup. We compare the timestamp so we never re-fire while a
      // toast is still up.
      if (d.lastAppliedPerkId) {
        const ts = d.lastAppliedPerkAt;
        setPerkToast(prev => (prev && prev.key === ts ? prev : { id: d.lastAppliedPerkId!, key: ts }));
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
          submitScore(total)
            .then(() => sendBeatNotify(total))
            .catch(() => { /* silent */ });
          if (total > highScore) {
            localStorage.setItem(HIGH_KEY, String(total));
            setHighScore(total);
          }
          setStoreState(earn(storeState, total));
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
  }, [phase, highScore, submitScore, showLevelTitle, sendBeatNotify, storeState, setStoreState]);

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

  // Keep the canvas mounted on splash so the user sees a live preview
  // of the cop on the street; HUD stays hidden until they start moving.
  const showCanvas = true;
  const showHud = phase === 'playing';
  const canvasFrameloop = phase === 'playing' ? 'always' : 'demand';

  // Splash → playing transition. The instant the joystick activates on
  // the splash, kick off the run. The same touch that triggered the
  // joystick keeps it active (the window listeners in useJoystick stay
  // bound across the phase flip), so the player walks the moment they
  // drag — no second tap needed.
  useEffect(() => {
    if (phase === 'splash' && view.active) {
      start();
    }
  }, [phase, view.active, start]);

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

      {showHud && (
        <div className="ln__hud">
          {/* HUD priority — three tiers, condensed from the old 8-element
              scatter:
                MAIN  — top-left main pill: hearts + score + weapon chip
                NEXT  — slim XP bar directly under
                EDGE  — corner labels: NIGHT N and goal/kill chip
              Reshuffle + standalone TIME readout removed (exit goal made
              the timer informational; no need to surface it). */}
          <div className="bp__hud-main">
            <div className="bp__hearts" aria-label={`${hp} of 3 hearts`}>
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`bp__heart${i < hp ? '' : ' bp__heart--gone'}`}
                  aria-hidden="true"
                >♥</span>
              ))}
            </div>
            <div className="bp__hud-score">{score.toLocaleString()}</div>
            <div
              className="bp__hud-weapon"
              style={{ ['--weapon-tint' as string]: WEAPONS[currentWeaponId].tint }}
            >
              <span className="bp__hud-weapon-name">{WEAPONS[currentWeaponId].label}</span>
              {currentWeaponId !== 'pistol' && (
                <span className="bp__hud-weapon-stars" aria-label={`level ${currentWeaponLevel}`}>
                  {'★'.repeat(currentWeaponLevel)}{'·'.repeat(5 - currentWeaponLevel)}
                </span>
              )}
            </div>
          </div>

          {/* XP bar — sits directly under the main pill, slim. */}
          <div className="bp__hud-xp" aria-label={`xp ${xpInLevel} of ${xpNeededForLevel}`}>
            <div
              className="bp__hud-xp-fill"
              style={{ width: `${Math.min(100, (xpInLevel / Math.max(1, xpNeededForLevel)) * 100)}%` }}
            />
            <span className="bp__hud-xp-label">LVL {xpLevel}</span>
          </div>

          {/* Corner label — NIGHT + goal/kill progress packed together. */}
          <div className="bp__hud-corner">
            <span className="bp__hud-corner-night">N{level} · {getLevelTuning(level).name.toUpperCase()}</span>
            {(() => {
              const lvlKey = (level === 1 || level === 2 || level === 3) ? level : 1;
              const goal = NIGHT_KILL_GOAL[lvlKey as 1 | 2 | 3];
              if (exitOpen) {
                return <span className="bp__hud-corner-goal bp__hud-corner-goal--open">★ FIND EXIT</span>;
              }
              if (goal > 0) {
                return <span className="bp__hud-corner-goal">{Math.min(killsThisNight, goal)} / {goal} KILLS</span>;
              }
              return <span className="bp__hud-corner-goal">KILL THE BOSS</span>;
            })()}
            <span className="bp__hud-corner-kills">{kills} kills · {Math.floor(60 - timeLeft) >= 0 ? `${Math.floor(60 - timeLeft)}s` : ''}</span>
          </div>

        </div>
      )}

      <img className="ln__watermark" src={alteruSvg} alt="AlterU" />

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

      {phase === 'splash' && (
        <SplashScene
          onOpenStore={() => setStoreOpen(true)}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          highScore={highScore}
          picked={storeState.picked}
          champion={champion}
        />
      )}

      {storeOpen && (
        <StoreScreen
          state={storeState}
          onChange={setStoreState}
          onClose={() => setStoreOpen(false)}
        />
      )}

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
      {exitToastKey > 0 && (
        <div
          key={`exit-toast-${exitToastKey}`}
          className="bp__exit-toast"
          aria-live="polite"
        >
          <span className="bp__exit-toast-eyebrow">★ EXIT OPEN ★</span>
          <span className="bp__exit-toast-sub">find the violet beacon</span>
        </div>
      )}

      {weaponToast && (() => {
        const w = WEAPONS[weaponToast.id];
        const stars = '★'.repeat(weaponToast.level);
        const headline = weaponToast.kind === 'levelup' ? 'LEVEL UP' : 'EQUIPPED';
        const sub = weaponToast.kind === 'levelup'
          ? `${w.label} ${stars}`
          : `${w.label} ${stars}`;
        return (
          <div
            key={`wt-${weaponToast.key}`}
            className="bp__weapon-toast"
            style={{ ['--weapon-tint' as string]: w.tint }}
          >
            <span className="bp__weapon-toast-headline">{headline}</span>
            <span className="bp__weapon-toast-sub">{sub}</span>
          </div>
        );
      })()}

      {perkToast && (() => {
        const perk = PERKS.find(p => p.id === perkToast.id);
        if (!perk) return null;
        return (
          <div
            key={perkToast.key}
            className="bp__perk-toast"
            style={{ ['--perk-tint' as string]: perk.tint }}
          >
            <span className="bp__perk-toast-dot" />
            <span className="bp__perk-toast-label">{perk.label}</span>
            <span className="bp__perk-toast-desc">{perk.description}</span>
          </div>
        );
      })()}
    </div>
  );
}
