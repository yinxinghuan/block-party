import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import type { LeaderboardEntry } from '@shared/leaderboard';
import { useGameEvent, telegramId } from '@shared/runtime';
import { callAigramAPI, isInAigram as inAigram } from '../shared/runtime/bridge';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { StoreScreen } from './components/StoreScreen';
import { loadStore, saveStore, earn, resolveSurvivor, type StoreState } from './store';
import { createGameState, startLevel } from './hooks/useGameLoop';
import type { PickupKind, SfxKey } from './hooks/useGameLoop';
import { CARTRIDGE, type HeroId } from './cartridge';
import { WEAPONS, type WeaponId } from './builders/weapons';
import { PERKS } from './perks';
import { getKillGoal } from './constants';
import { getLevelTuning } from './constants';
import { useJoystick } from './hooks/useJoystick';
import { playSfx, setBgmTension, setHeartbeatRate, startBgm, stopBgm, stopHeartbeat, unlockAudio } from './utils/audio';
import { t } from './i18n';
import alteruSvg from './img/alteru.svg';
import './BlockParty.less';
import './SplashScene.less';

type Phase = 'splash' | 'playing' | 'gameover';

const HIGH_KEY = 'blockParty_high';

interface Pellet { id: number; value: number; kind: PickupKind; dx: number; dy: number; }

let pelletIdCounter = 1;

// All HUD values that the 250ms poll writes — collapsed into one state
// object so React can bail out of reconcile via reference equality
// when nothing changed (perf #6). 4Hz polling × 12 useStates was
// dispatching a full BlockParty tree diff every interval even when
// every value was stable. With one object + shallow-equal short-circuit,
// idle frames return `prev` and React skips the whole render.
interface HudState {
  score: number;
  kills: number;
  hp: number;
  xpInLevel: number;
  xpNeededForLevel: number;
  xpLevel: number;
  currentWeaponId: WeaponId;
  currentWeaponLevel: number;
  killsThisNight: number;
  exitOpen: boolean;
  level: number;
  timeLeft: number;
}
const INITIAL_HUD: HudState = {
  score: 0,
  kills: 0,
  hp: 3,
  xpInLevel: 0,
  xpNeededForLevel: 5,
  xpLevel: 0,
  currentWeaponId: 'pistol',
  currentWeaponLevel: 1,
  killsThisNight: 0,
  exitOpen: false,
  level: 1,
  timeLeft: 0,
};
function hudShallowEqual(a: HudState, b: HudState): boolean {
  return a.score === b.score
    && a.kills === b.kills
    && a.hp === b.hp
    && a.xpInLevel === b.xpInLevel
    && a.xpNeededForLevel === b.xpNeededForLevel
    && a.xpLevel === b.xpLevel
    && a.currentWeaponId === b.currentWeaponId
    && a.currentWeaponLevel === b.currentWeaponLevel
    && a.killsThisNight === b.killsThisNight
    && a.exitOpen === b.exitOpen
    && a.level === b.level
    && a.timeLeft === b.timeLeft;
}

export function BlockParty() {
  const [phase, setPhase] = useState<Phase>('splash');
  // Single consolidated HUD state — see HudState above for the rationale.
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [, setDepth] = useState(0);
  const [selectedSurvivor, setSelectedSurvivor] = useState<HeroId>(CARTRIDGE.starterHeroIds[0]);
  // Identity hero — when set, the player's face maps onto the low-poly body.
  // Source: the Aigram avatar in-platform, or a file pick when standalone.
  // Persisted so "play as me" survives refreshes; only offered when the
  // active cartridge supports a photo hero.
  const [heroPhotoUrl, setHeroPhotoUrl] = useState<string | null>(
    () => localStorage.getItem('bp_hero_photo'),
  );
  const supportsPhotoHero = !!CARTRIDGE.buildHeroFromPhoto;

  const setHeroPhoto = useCallback((url: string | null) => {
    setHeroPhotoUrl(url);
    if (url) localStorage.setItem('bp_hero_photo', url);
    else localStorage.removeItem('bp_hero_photo');
  }, []);

  // Obtain the player's face image. In Aigram, pull their avatar (head_url) so
  // it's literally one tap — no upload. Standalone, fall back to a file pick.
  const pickHeroPhoto = useCallback(async () => {
    if (heroPhotoUrl) { setHeroPhoto(null); return; }  // toggle off
    if (inAigram && telegramId) {
      try {
        const info = await callAigramAPI<{ head_url?: string }>(
          `/note/telegram/user/get/info/by/telegram_id?telegram_id=${telegramId}`,
        );
        if (info?.head_url) { setHeroPhoto(info.head_url); return; }
      } catch { /* fall through to file pick */ }
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) setHeroPhoto(URL.createObjectURL(file));
    };
    input.click();
  }, [heroPhotoUrl, setHeroPhoto]);
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
  const [weaponToast, setWeaponToast] = useState<{ id: WeaponId; level: number; kind: 'swap' | 'levelup'; key: number } | null>(null);
  // Weapon-as-armor downgrade toast — fires every time a hit eats a
  // weapon level instead of HP. Separate state so the green
  // upgrade-style weaponToast doesn't collide with the red downgrade.
  const [weaponDowngrade, setWeaponDowngrade] = useState<{ id: WeaponId; level: number; key: number } | null>(null);
  const lastWeaponDowngradeRef = useRef(0);
  // Exit-goal HUD: one-shot "EXIT OPEN" toast the moment the beacon spawns.
  // (kill progress / exit-open flag live on hud above.)
  const [exitToastKey, setExitToastKey] = useState(0);
  // Anti-stall "ELITE INCOMING" toast — fires each time the game loop
  // spawns an elite stalker (after the level overstays the threshold).
  const [eliteToastKey, setEliteToastKey] = useState(0);
  const lastEliteAlertRef = useRef(0);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HIGH_KEY) || 0));
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [hitFlashKey, setHitFlashKey] = useState(0);
  // Level intro overlay — appears briefly at the start of every level.
  const [levelTitle, setLevelTitle] = useState<{ level: number; name: string; key: number } | null>(null);
  // Level-clear overlay shown between levels with score bonus.
  const [clearOverlay, setClearOverlay] = useState<{ level: number; bonus: number; total: number } | null>(null);
  // (Endless: no terminal victory state — runs end only on death.)

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
  const [champion, setChampion] = useState<{ name: string; score: number; avatar_url: string; user_id: string } | null>(null);
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
          setChampion({
            name: top.name || 'anon',
            score: Number(top.score),
            avatar_url: top.avatar_url || '',
            user_id: String(top.user_id || ''),
          });
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

  // Score updates fire on every kill (push from useGameLoop). Route them
  // into the consolidated hud state; setHud will bail out if the value is
  // already equal to the cached one.
  const onScore = useCallback((s: number) => {
    setHud(prev => prev.score === s ? prev : { ...prev, score: s });
  }, []);
  const onDepth = useCallback((d: number) => setDepth(d), []);
  // Lantern light is gone; the prop is kept for API stability but we no
  // longer pipe it anywhere.
  const onLightRadius = useCallback((_r: number) => {}, []);

  // Two-channel pickup feedback:
  //   • Center pellet (~600ms): just "+N" near the player for instant
  //     "score went up" satisfaction. The score number on the HUD pill and
  //     the XP bar are the totalizer; no separate pickup banner needed.
  const onPickup = useCallback((kind: PickupKind, value: number) => {
    const pid = pelletIdCounter++;
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 30;
    setPellets(prev => [...prev, { id: pid, kind, value, dx, dy }]);
    window.setTimeout(() => setPellets(prev => prev.filter(p => p.id !== pid)), 700);
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

  const start = useCallback((survivorPick?: HeroId) => {
    // CRITICAL: set the playing phase synchronously BEFORE touching audio.
    // Resolve which survivor to play as: explicit pick wins, else the
    // store's picked selection (with random→roll handled in store.ts).
    const resolved = survivorPick ?? resolveSurvivor(storeState);
    setSelectedSurvivor(resolved);
    stateRef.current = createGameState();
    lastEliteAlertRef.current = 0;   // re-arm elite-spawn detection for the new run
    // One write resets the whole HUD instead of 12 separate setStates.
    setHud({ ...INITIAL_HUD, timeLeft: getLevelTuning(1).timeLimit });
    setPerkToast(null);
    setWeaponToast(null);
    setWeaponDowngrade(null);
    lastWeaponDowngradeRef.current = 0;
    setDepth(0);
    setPellets([]);
    setClearOverlay(null);
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
      // Single consolidated HUD write — compute the full next object and
      // bail out via reference equality if nothing actually changed
      // (perf #6). React's useState bails on `prev === next` and skips
      // the entire component-tree reconcile.
      setHud(prev => {
        const next: HudState = {
          score: Math.floor(d.score),
          kills: d.kills,
          hp: d.hp,
          xpInLevel: d.xpInLevel,
          xpNeededForLevel: d.xpNeededForLevel,
          xpLevel: d.xpLevel,
          currentWeaponId: d.currentWeaponId,
          currentWeaponLevel: d.currentWeaponLevel,
          killsThisNight: d.killsThisNight,
          exitOpen: !!d.exit,
          level: d.level,
          timeLeft: Math.max(0, tuning.timeLimit - d.levelT),
        };
        return hudShallowEqual(prev, next) ? prev : next;
      });
      if (d.exitJustOpened) {
        d.exitJustOpened = false;
        setExitToastKey(k => k + 1);
      }
      // Elite spawn alert — fires whenever the loop drops a fresh anti-
      // stall elite. We snapshot the spawn timestamp so we don't re-fire
      // the toast on subsequent polls.
      if (d.lastEliteAlertAt > lastEliteAlertRef.current) {
        lastEliteAlertRef.current = d.lastEliteAlertAt;
        setEliteToastKey(k => k + 1);
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
      // Weapon-as-armor downgrade — fires every time a hit strips a
      // weapon level instead of HP. lastWeaponDowngradeAt is monotonic
      // so we use a ref to dedupe across polls.
      if (d.lastWeaponDowngradeAt > lastWeaponDowngradeRef.current) {
        lastWeaponDowngradeRef.current = d.lastWeaponDowngradeAt;
        setWeaponDowngrade({
          id: d.lastWeaponDowngradeId ?? 'pistol',
          level: d.lastWeaponDowngradeLevel,
          key: d.lastWeaponDowngradeAt,
        });
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

        // Endless — every cleared night queues the next. No victory state.
        setClearOverlay({ level: d.level, bonus: levelBonus + timeBonus, total });
        window.setTimeout(() => {
          setClearOverlay(null);
          startLevel(d, d.level + 1);
          showLevelTitle(d.level);
          transitioning = false;
        }, 1900);
      }
    }, 250);  // was 150ms — that's 6.7 polls/s × 12 setState calls; 4/s
              // is plenty for HUD readouts (hearts / score / level / xp /
              // weapon stars / kill count) which change at human-scale
              // not frame-scale.
    return () => window.clearInterval(id);
  }, [phase, showLevelTitle]);

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
  // frameloop="always" on splash too so the Crossy Road idle hop and the
  // ambient cosmetics (fireflies / neon flicker / streetlamp pulse) run —
  // gameplay logic is gated on `playing=false` inside useGameLoop, so this
  // only animates visuals, not state.
  const showCanvas = true;
  const showHud = phase === 'playing';
  const canvasFrameloop = phase === 'gameover' ? 'demand' : 'always';

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
          {/* DPR capped at 1.6 (was 2) — saves ~25% fragment cost on iPhones
              (device pixel ratio 3 → render at 1.6× instead of 2×) without a
              visually obvious downgrade at the camera distance the game runs
              at. `shadows` prop dropped: no scene light casts shadows anymore
              after perf #1, so the shadowmap infrastructure was dead weight. */}
          <Canvas dpr={[1, 1.6]} gl={{ antialias: true }} frameloop={canvasFrameloop}>
            <Scene
              state={stateRef}
              playing={phase === 'playing'}
              level={hud.level}
              stickRef={stickRef}
              survivor={selectedSurvivor}
              heroPhotoUrl={heroPhotoUrl}
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
            <div className="bp__hearts" aria-label={`${hud.hp} of 3 hearts`}>
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`bp__heart${i < hud.hp ? '' : ' bp__heart--gone'}`}
                  aria-hidden="true"
                >♥</span>
              ))}
            </div>
            <div className="bp__hud-score">{hud.score.toLocaleString()}</div>
            <div
              className="bp__hud-weapon"
              style={{ ['--weapon-tint' as string]: WEAPONS[hud.currentWeaponId].tint }}
            >
              <span className="bp__hud-weapon-name">{WEAPONS[hud.currentWeaponId].label}</span>
              {hud.currentWeaponId !== 'pistol' && (
                <span className="bp__hud-weapon-stars" aria-label={`level ${hud.currentWeaponLevel}`}>
                  {'★'.repeat(hud.currentWeaponLevel)}{'·'.repeat(5 - hud.currentWeaponLevel)}
                </span>
              )}
            </div>
          </div>

          {/* XP bar — sits directly under the main pill, slim. */}
          <div className="bp__hud-xp" aria-label={`xp ${hud.xpInLevel} of ${hud.xpNeededForLevel}`}>
            <div
              className="bp__hud-xp-fill"
              style={{ width: `${Math.min(100, (hud.xpInLevel / Math.max(1, hud.xpNeededForLevel)) * 100)}%` }}
            />
            <span className="bp__hud-xp-label">LVL {hud.xpLevel}</span>
          </div>

          {/* Corner label — NIGHT + goal/kill progress packed together. */}
          <div className="bp__hud-corner">
            <span className="bp__hud-corner-night">N{hud.level} · {getLevelTuning(hud.level).name.toUpperCase()}</span>
            {(() => {
              if (hud.exitOpen) {
                return <span className="bp__hud-corner-goal bp__hud-corner-goal--open">★ FIND EXIT</span>;
              }
              const goal = getKillGoal(hud.level);
              if (goal > 0) {
                return <span className="bp__hud-corner-goal">{Math.min(hud.killsThisNight, goal)} / {goal} KILLS</span>;
              }
              return <span className="bp__hud-corner-goal">KILL THE BOSS</span>;
            })()}
            <span className="bp__hud-corner-kills">{hud.kills} kills · {Math.floor(60 - hud.timeLeft) >= 0 ? `${Math.floor(60 - hud.timeLeft)}s` : ''}</span>
          </div>

        </div>
      )}

      {/* In-game champion pill — the only place the player can see #1
          once they've started a run (splash never comes back). Crossy
          Road / Sky Leap gold crown + circular avatar + name. Tap opens
          the full leaderboard. Champion snapshot is fetched on splash
          and held for the session. */}
      {phase === 'playing' && champion && (
        <button
          className="bp__champion-pill"
          onPointerDown={(e) => {
            e.nativeEvent.stopPropagation();
            setShowLeaderboard(true);
          }}
        >
          <svg className="bp__crown" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 8 L7 13 L12 6 L17 13 L21 8 L20 18 L4 18 Z" />
          </svg>
          <span className="bp__champion-pill-avatar">
            {champion.avatar_url
              ? <img src={champion.avatar_url} alt="" draggable={false} />
              : champion.name.charAt(0).toUpperCase()}
          </span>
          <span className="bp__champion-pill-name">{champion.name}</span>
        </button>
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
          photoHero={supportsPhotoHero ? { active: !!heroPhotoUrl, onToggle: pickHeroPhoto } : undefined}
        />
      )}

      {/* Night intro — brief overlay at start of each night */}
      {phase === 'playing' && levelTitle && (
        <div className="ln__level-intro" key={levelTitle.key}>
          <div className="ln__level-intro-num">NIGHT {levelTitle.level}</div>
          <div className="ln__level-intro-name">{levelTitle.name}</div>
          <div className="ln__level-intro-sub">{t('intro_sub')}</div>
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

      {/* Endless — no victory overlay; runs end only on death. */}

      {phase === 'gameover' && (
        <div className="ln__gameover">
          <div className="ln__gameover-eyebrow">
            {finalScore > 0 && finalScore === highScore ? 'NEW RECORD' : 'BITTEN'}
          </div>
          <div className="ln__final-score">{finalScore.toLocaleString()}</div>
          <div className="ln__final">FELL ON NIGHT {hud.level} · {getLevelTuning(hud.level).name.toUpperCase()}</div>
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
      {eliteToastKey > 0 && (
        <div
          key={`elite-toast-${eliteToastKey}`}
          className="bp__elite-toast"
          aria-live="polite"
        >
          <span className="bp__elite-toast-eyebrow">⚠ ELITE INCOMING ⚠</span>
          <span className="bp__elite-toast-sub">move toward the exit</span>
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

      {weaponDowngrade && (() => {
        const w = WEAPONS[weaponDowngrade.id];
        const stars = weaponDowngrade.id === 'pistol'
          ? '·····'
          : '★'.repeat(weaponDowngrade.level) + '·'.repeat(5 - weaponDowngrade.level);
        const headline = weaponDowngrade.id === 'pistol' ? 'WEAPON LOST' : 'WEAPON WEAKENED';
        return (
          <div
            key={`wd-${weaponDowngrade.key}`}
            className="bp__weapon-downgrade"
            aria-live="polite"
          >
            <span className="bp__weapon-downgrade-headline">{headline}</span>
            <span className="bp__weapon-downgrade-sub">{w.label} {stars}</span>
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
