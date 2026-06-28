# Arcade Cartridge — how this engine makes many games

This top-down survival game is split into two halves:

- **The ENGINE** (`useGameLoop.ts`, `Scene.tsx`, the tuning math in `constants.ts`,
  the shared runtime/leaderboard/social) — locked. It owns *how the game plays*:
  difficulty curve, HP/speed/score per role, auto-fire, collision, knockback,
  ragdoll, boss behaviours, juice, audio. A player can't make this worse.
- **The CARTRIDGE** (`cartridge/`) — swappable. It owns *only the theme*: what
  each gameplay slot looks like and is called.

Swap the cartridge → a new game. The engine never changes. This is what lets a
one-sentence idea ("a cat surviving a flood of robot vacuums") become a
Block-Party-grade game without touching a single tuning number.

## The one rule

> **If a field would change how HARD the game is, it does NOT belong in a cartridge.**

HP, speed, damage, spawn rates, cooldowns, the difficulty curve — all engine.
A cartridge may only change *looks, names, colours, and copy*. That rule is the
reason a novice can't ship a broken game: they never touch the half that can break.

## What a cartridge provides (`ArcadeCartridge`, see `types.ts`)

| Field | Owns | Engine guarantee |
|---|---|---|
| `copy` | title, tagline, rules, button text (en/zh) | merged over generic chrome in `i18n` |
| `palette[3]` | 3-night colour + name cycle (floor/fog/ambient/lights/props) | rotated by `(level-1) % 3` |
| `buildEnemy(role, bossKind?)` | the 3D visual for each gameplay ROLE | engine sets HP/speed/score for that role |
| `bossLadder[]` | which themed boss fills each level rung | engine owns the schedule + behaviours |
| `buildHero(id)` / `heroes[]` | player visuals + store roster | every hero plays identically |
| `starterHeroIds` / `heroUnlockPrice` | which heroes are free, cosmetic unlock cost | not a balance lever |
| `audioMood?` | 0..1 eerie-melody floor | maps to `bgmTension` baseline |

### Roles vs skins — the core idea

The 2535-line game loop only ever speaks in **abstract roles**: `lurker`,
`runner`, `brute`, `stalker`, `exploder`, `ghost`, `boss`. It never names a
zombie. Each role is a *gameplay slot* with locked tuning; the cartridge supplies
the *skin* (a `THREE.Group` builder + a name) for that slot. To reskin the game
you map each role to a new creature — the feel is inherited for free.

Boss rungs work the same way: `bossLadder` is a list of **behaviour archetypes**
the engine implements (charge / beam / shield / summon / burstfire / blink /
flank / rage / melee). The cartridge picks which behaviours form its ladder and
returns the matching visual from `buildEnemy('boss', kind)`.

## How to make a new game from this engine

1. Copy `zombie.ts` → `mytheme.ts`.
2. Write `copy` (en + zh) — title, subtitle, the three rule lines, button labels.
3. Pick a 3-step `palette` that reads at a glance (e.g. dawn → noon → storm).
4. Map each enemy role to a creature and each boss rung to a creature. Either
   reuse existing builders from `builders/`/`_lowpoly_lab`, or author new ones
   (see the `lowpoly-asset-factory` skill — keep the locked house style).
5. Map `heroes` + `starterHeroIds`. For a photo-hero game, `buildHero` turns the
   player's uploaded portrait into a sprite/billboard (see the deferred note).
6. Point `CARTRIDGE` in `index.ts` at your cartridge. Done — `npm run build`.

## Deferred seams (known, not forgotten)

- **Boss behaviour ↔ skin are still coupled** inside `builders/monsters.ts`
  (a `BossKind` carries both). A true reskin that reuses, say, the *charge*
  behaviour under a new look needs that split. Until then, a new cartridge reuses
  the existing boss visuals or ships new builders keyed to the same `BossKind`s.
- **Photo-hero path** (`buildHero` from an uploaded portrait via img2img) is
  speced but not wired here — it's the first thing the cartridge *generator* adds.
- **Splash wordmark** (`SplashScene.tsx`) still hard-codes the two-tone
  "BLOCK / PARTY" title for its styling; move to `copy` when a cartridge needs it.
