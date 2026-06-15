// BlockParty audio — dark cave ambient + procedural SFX. All-WebAudio, no
// asset files. SFX keys match the game loop's emissions exactly:
// pickup_{gold,red,green,blue}, strike_{telegraph,hit}, wall_pulse,
// monster_flee, game_over.
//
// BGM is a slow drone bed (cave breath) + intermittent stalactite drips.
// A separate heartbeat layer is rate-driven by `setHeartbeatRate(bpm)` so
// the game loop can push it from ~50 bpm (safe) to ~150 bpm (monster
// closing in) and have the player feel it without seeing it.

export type SfxKey =
  | 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue'
  | 'strike_telegraph' | 'strike_hit'
  | 'wall_pulse' | 'monster_flee' | 'game_over'
  | 'shoot' | 'kill';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  return ctx;
}

export async function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state === 'suspended') await c.resume();
}

// ---------- low-level helpers ----------
function tone(
  freq: number, type: OscillatorType, dur: number, peak: number,
  t0: number, glideTo?: number, dst?: AudioNode,
) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dst ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur: number, peak: number, t0: number, lp = 2000, hp = 0) {
  if (!ctx || !master) return;
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let chain: AudioNode = src;
  if (hp > 0) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    chain = (chain as AudioNode).connect ? (chain.connect(hpf), hpf) : hpf;
  }
  chain.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function bell(freq: number, peak: number, t0: number, decay = 1.0, dst?: AudioNode) {
  if (!ctx || !master) return;
  const dest = dst ?? master;
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(freq, t0);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(freq * 2.76, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + decay);
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  o1.connect(g);
  o2.connect(g2).connect(g);
  g.connect(dest);
  o1.start(t0); o1.stop(t0 + decay + 0.1);
  o2.start(t0); o2.stop(t0 + decay + 0.1);
}

// ---------- SFX ----------
// Per-key minimum interval (seconds, on AudioContext time). Without this,
// endless L8+ would spawn 20-30 sfx/sec, each allocating 4-8 Web Audio
// nodes (osc + gain + buffer + filter), and that allocation rate spills
// onto the audio thread + main thread. Same-frame events (5-pellet
// shotgun, simultaneous kills, all-zombies-telegraphing) collapse to a
// single playback for each event family. Sub-50ms gaps are inaudible
// anyway — the ear treats them as one impact.
const SFX_MIN_INTERVAL: Partial<Record<SfxKey, number>> = {
  shoot:            0.04,
  kill:             0.05,
  strike_telegraph: 0.08,
  strike_hit:       0.05,
  pickup_gold:      0.03,
  pickup_red:       0.06,
  pickup_green:     0.06,
  pickup_blue:      0.06,
  monster_flee:     0.08,
  // wall_pulse / game_over not throttled — fire rarely enough that
  // they never collide with themselves.
};
const sfxLastT = new Map<SfxKey, number>();

export function playSfx(key: SfxKey) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  const minInt = SFX_MIN_INTERVAL[key];
  if (minInt !== undefined) {
    const last = sfxLastT.get(key);
    if (last !== undefined && t - last < minInt) return;
    sfxLastT.set(key, t);
  }
  switch (key) {
    case 'pickup_gold':
      // Bright two-note coin chime — sparkly, "ding-ding"
      bell(1480, 0.22, t,        0.55);
      bell(1980, 0.18, t + 0.06, 0.50);
      break;
    case 'pickup_red':
      // BlockParty grows — warm rising swell with a fundamental thump
      tone(220, 'sine',     0.40, 0.28, t, 330);
      tone(660, 'triangle', 0.30, 0.20, t + 0.05, 990);
      bell(1320, 0.16, t + 0.10, 0.70);
      break;
    case 'pickup_green':
      // 5-second strong-light bloom — bright ascending arp
      tone(880, 'triangle',  0.10, 0.20, t,        1100);
      tone(1100, 'triangle', 0.10, 0.22, t + 0.06, 1320);
      tone(1320, 'triangle', 0.10, 0.24, t + 0.12, 1760);
      bell(2200, 0.18, t + 0.18, 0.90);
      break;
    case 'pickup_blue':
      // Crystalline wall conjure — high shimmer + descent
      bell(2640, 0.20, t,        0.40);
      bell(1980, 0.18, t + 0.08, 0.55);
      tone(440, 'triangle', 0.30, 0.18, t + 0.04, 330);
      break;
    case 'strike_telegraph':
      // Whispering shadow — filtered noise sweep + low growl that
      // builds for the 1.2s telegraph window
      noiseBurst(0.30, 0.10, t,         600, 200);
      noiseBurst(0.50, 0.07, t + 0.10,  900, 300);
      tone(85, 'sawtooth', 0.60, 0.10, t, 130);
      break;
    case 'strike_hit':
      // Sharp grab — heavy low thud + scrape
      tone(120, 'sine',  0.18, 0.45, t, 40);
      noiseBurst(0.25, 0.32, t,       1800);
      noiseBurst(0.40, 0.15, t + 0.05, 400);
      break;
    case 'wall_pulse':
      // Blue-crystal wall pulse — low whoosh + ringing harmonic
      tone(180, 'sine',     0.45, 0.22, t, 90);
      tone(540, 'triangle', 0.35, 0.16, t + 0.03, 360);
      noiseBurst(0.20, 0.06, t, 3000, 800);
      break;
    case 'monster_flee':
      // Hissed recoil — fast filtered noise sweeping up
      noiseBurst(0.18, 0.16, t,        3500, 1200);
      tone(900, 'sawtooth', 0.12, 0.10, t + 0.02, 1500);
      break;
    case 'game_over':
      // Slow descending dirge — three notes drop into the void
      tone(330, 'triangle', 0.50, 0.30, t,         220);
      tone(220, 'triangle', 0.50, 0.28, t + 0.40,  165);
      tone(165, 'sawtooth', 0.80, 0.26, t + 0.85,  110);
      noiseBurst(1.2, 0.12, t + 0.20, 400, 80);
      break;
    case 'shoot':
      // Punchier kah-pow — wider noise hi-band + sub thump + 1.6kHz crack.
      // Still under 80ms so a 3-shot/sec auto-fire stays clean.
      noiseBurst(0.07, 0.22, t,        5800, 2400);   // crack
      tone(60, 'sine',     0.22, 0.30, t, 40);         // sub thump
      tone(220, 'square',  0.12, 0.10, t, 110);        // body click
      break;
    case 'kill':
      // Bigger wet crunch — fatter low sweep + grit noise + a wet pop tail
      tone(70,  'sawtooth', 0.18, 0.48, t, 32);
      noiseBurst(0.13, 0.24, t,        1100, 180);
      noiseBurst(0.05, 0.14, t + 0.02, 5000, 2200);    // splatter crack
      bell(620, 0.10, t + 0.05, 0.40);
      break;
  }
}

// ---------- BGM ----------
//
// Dark cave bed. Three voices, all on bgmGain so master volume controls them
// together:
//   • DRONE  — a low sine (~55Hz, F1) with very slow LFO on a lowpass cutoff,
//              giving a "breathing" filtered drone. Stays at the bottom.
//   • WIND   — slow filtered noise that swells in and out every ~12s, like
//              air moving through a passage.
//   • DRIPS  — random high-pitched stalactite pings (bell w/ short decay),
//              roughly one every 4-8s.

let bgmGain: GainNode | null = null;
let bgmRunning = false;
let bgmTimer: number | null = null;
let droneOsc: OscillatorNode | null = null;
let droneFilt: BiquadFilterNode | null = null;
let droneLfo: OscillatorNode | null = null;
let windSrc: AudioBufferSourceNode | null = null;
let windFilt: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;

function makeNoiseLoopBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.ceil(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  return buf;
}

function scheduleDrip(firstRun = false) {
  if (!ctx || !bgmGain || !bgmRunning) return;
  // Steady-state cadence is 4-9 s apart. The very first drip lands within
  // ~0.4-1.4 s of startBgm so the soundscape is present immediately — the
  // user shouldn't have to fire half a clip before the BGM proves itself.
  const delay = firstRun ? 0.4 + Math.random() : 4 + Math.random() * 5;
  bgmTimer = window.setTimeout(() => {
    if (!ctx || !bgmGain || !bgmRunning) return;
    const t = ctx.currentTime + 0.02;
    const root = 1800 + Math.random() * 1400;
    bell(root, 0.07, t, 0.9, bgmGain);
    scheduleDrip();
  }, delay * 1000) as unknown as number;
}

// ---------- EERIE MELODY LAYER ----------
// Sparse low-register notes in D minor that sit on top of the drone bed.
// Each "phrase" is two detuned sine tones (a sustained main note + an
// inharmonic shadow partial 12 cents below) so the result beats slightly
// and feels unsettled. Scheduled at random intervals; cadence + volume
// scale with `bgmTension` so deeper levels feel more haunted.
//
// D minor scale notes (relative to D3 = ~146.8 Hz):
//   D3, F3, G3, A3, Bb3, C4, D4, F4, Eb4 (dissonant lean)
const MELODY_NOTES_HZ = [146.83, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 349.23, 311.13];
let melodyTimer: number | null = null;
let bgmTension = 0.3;

export function setBgmTension(tension: number) {
  bgmTension = Math.max(0, Math.min(1, tension));
}

function melodyVoice(freq: number, t0: number, peak: number) {
  if (!ctx || !bgmGain) return;
  // Main + slightly-detuned shadow for beating dissonance.
  for (const detune of [0, -12]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = freq * Math.pow(2, detune / 1200);
    o.frequency.setValueAtTime(f, t0);
    const g = ctx.createGain();
    const dur = 2.4 + Math.random() * 1.2;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);
    // Lowpass shaped like a hollow vowel
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1200;
    filt.Q.value = 1.6;
    o.connect(filt).connect(g).connect(bgmGain);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }
}

function scheduleMelody(firstRun = false) {
  if (!ctx || !bgmGain || !bgmRunning) {
    melodyTimer = null;
    return;
  }
  // Steady-state gap shrinks with tension: ~18s at tension=0 → ~5s at
  // tension=1. The very first phrase lands within ~1-2 s so the eerie
  // melody layer is part of the BGM from the start instead of 10+ s in,
  // and it's a guaranteed play (not subject to the usual skip roll).
  if (firstRun) {
    melodyTimer = window.setTimeout(() => {
      if (!ctx || !bgmGain || !bgmRunning) return;
      const t = ctx.currentTime + 0.02;
      const idx = Math.floor(Math.random() * MELODY_NOTES_HZ.length);
      const peak = (0.025 + bgmTension * 0.045);
      melodyVoice(MELODY_NOTES_HZ[idx], t, peak);
      scheduleMelody();
    }, 1000 + Math.random() * 800) as unknown as number;
    return;
  }
  const baseGap = 18 - bgmTension * 13;
  const delaySec = baseGap + (Math.random() - 0.5) * 5;
  melodyTimer = window.setTimeout(() => {
    if (!ctx || !bgmGain || !bgmRunning) return;
    // Sometimes skip — silence is part of the texture, esp. at low tension
    const playChance = 0.5 + bgmTension * 0.45;
    if (Math.random() < playChance) {
      const t = ctx.currentTime + 0.02;
      const idx = Math.floor(Math.random() * MELODY_NOTES_HZ.length);
      // Volume scales with tension. Stays subtle on L1, more present on L6.
      const peak = (0.025 + bgmTension * 0.045);
      melodyVoice(MELODY_NOTES_HZ[idx], t, peak);
    }
    scheduleMelody();
  }, Math.max(2000, delaySec * 1000)) as unknown as number;
}

export function startBgm(volume = 0.18) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume();
  stopBgm();

  bgmGain = c.createGain();
  bgmGain.gain.value = 0;
  // 0.4s fade-in (was 2.0s) — long enough to avoid a click, short enough
  // that the BGM is at full level before the player even reads the HUD.
  bgmGain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.4);
  bgmGain.connect(master);

  // DRONE — sine ~55Hz through a lowpass that slowly opens/closes
  droneOsc = c.createOscillator();
  droneOsc.type = 'sine';
  droneOsc.frequency.value = 55;
  droneFilt = c.createBiquadFilter();
  droneFilt.type = 'lowpass';
  droneFilt.frequency.value = 280;
  droneFilt.Q.value = 4;
  const droneGain = c.createGain();
  droneGain.gain.value = 0.55;
  // LFO modulates cutoff between ~180 and ~420 every ~14s
  droneLfo = c.createOscillator();
  droneLfo.type = 'sine';
  droneLfo.frequency.value = 1 / 14;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 120;
  droneLfo.connect(lfoDepth).connect(droneFilt.frequency);
  droneOsc.connect(droneFilt).connect(droneGain).connect(bgmGain);
  droneOsc.start();
  droneLfo.start();

  // Soft 2nd-harmonic for body
  const harm = c.createOscillator();
  harm.type = 'sine';
  harm.frequency.value = 110;
  const harmGain = c.createGain();
  harmGain.gain.value = 0.10;
  harm.connect(harmGain).connect(bgmGain);
  harm.start();
  // Keep reference so stopBgm tears it down
  (droneOsc as any)._harm = harm;
  (droneOsc as any)._harmGain = harmGain;

  // WIND — looping noise, lowpass modulated, periodically swelling
  windSrc = c.createBufferSource();
  windSrc.buffer = makeNoiseLoopBuffer(c, 4);
  windSrc.loop = true;
  windFilt = c.createBiquadFilter();
  windFilt.type = 'lowpass';
  windFilt.frequency.value = 600;
  windFilt.Q.value = 0.8;
  windGain = c.createGain();
  // Start at the steady-state mid value (was 0.0 → 6 s swell up) so the
  // wind layer is already audible the moment BGM unmutes. scheduleWindSwell
  // then takes over the slow back-and-forth from here.
  windGain.gain.value = 0.10;
  windSrc.connect(windFilt).connect(windGain).connect(bgmGain);
  windSrc.start();
  // Slow swells via gain LFO — implemented with periodic ramps
  scheduleWindSwell();

  bgmRunning = true;
  scheduleDrip(true);
  scheduleMelody(true);
}

function scheduleWindSwell() {
  if (!ctx || !windGain || !bgmRunning) return;
  const t = ctx.currentTime;
  // up to ~0.18 over 6s, then down to 0.03 over 6s
  windGain.gain.cancelScheduledValues(t);
  windGain.gain.setValueAtTime(windGain.gain.value, t);
  windGain.gain.linearRampToValueAtTime(0.18 + Math.random() * 0.05, t + 6);
  windGain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.03, t + 12);
  window.setTimeout(scheduleWindSwell, 12000);
}

export function stopBgm() {
  bgmRunning = false;
  if (bgmTimer !== null) { window.clearTimeout(bgmTimer); bgmTimer = null; }
  if (melodyTimer !== null) { window.clearTimeout(melodyTimer); melodyTimer = null; }
  stopHeartbeat();
  if (bgmGain && ctx) {
    const t = ctx.currentTime;
    bgmGain.gain.cancelScheduledValues(t);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
    bgmGain.gain.linearRampToValueAtTime(0, t + 0.5);
    const g = bgmGain;
    const dOsc = droneOsc;
    const dLfo = droneLfo;
    const wSrc = windSrc;
    setTimeout(() => {
      try { dOsc?.stop(); } catch { /* */ }
      try { dLfo?.stop(); } catch { /* */ }
      try { (dOsc as any)?._harm?.stop(); } catch { /* */ }
      try { wSrc?.stop(); } catch { /* */ }
      g.disconnect();
    }, 700);
    bgmGain = null;
    droneOsc = null;
    droneFilt = null;
    droneLfo = null;
    windSrc = null;
    windFilt = null;
    windGain = null;
  }
}

// ---------- HEARTBEAT ----------
//
// A separate layer so the game loop can drive intensity. Two-thump pattern
// (lub-dub) at a rate controlled by setHeartbeatRate(bpm). Below ~50 bpm it
// goes silent (no threat). Volume scales with rate so it's gradually felt
// even before it's consciously noticed.

let heartbeatTimer: number | null = null;
let heartbeatBpm = 0;
let heartbeatGain: GainNode | null = null;

function thump(t0: number, peak: number) {
  if (!ctx || !heartbeatGain) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(80, t0);
  o.frequency.exponentialRampToValueAtTime(35, t0 + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.18);
  o.connect(g).connect(heartbeatGain);
  o.start(t0);
  o.stop(t0 + 0.22);
}

function scheduleHeartbeat() {
  if (!ctx || !heartbeatGain || heartbeatBpm < 50) {
    heartbeatTimer = null;
    return;
  }
  const t = ctx.currentTime + 0.02;
  // Volume ramps with rate: silent at 50bpm, full at 150bpm.
  const intensity = Math.max(0, Math.min(1, (heartbeatBpm - 50) / 100));
  const peak = 0.06 + intensity * 0.22;
  thump(t,        peak);
  thump(t + 0.16, peak * 0.85);
  const interval = 60_000 / heartbeatBpm;
  heartbeatTimer = window.setTimeout(scheduleHeartbeat, interval) as unknown as number;
}

export function setHeartbeatRate(bpm: number) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (!heartbeatGain) {
    heartbeatGain = c.createGain();
    heartbeatGain.gain.value = 1;
    heartbeatGain.connect(master);
  }
  const wasRunning = heartbeatTimer !== null;
  heartbeatBpm = bpm;
  if (bpm >= 50 && !wasRunning) {
    scheduleHeartbeat();
  }
}

export function stopHeartbeat() {
  if (heartbeatTimer !== null) { window.clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  heartbeatBpm = 0;
  if (heartbeatGain) {
    try { heartbeatGain.disconnect(); } catch { /* */ }
    heartbeatGain = null;
  }
}
