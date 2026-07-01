// ============================================================================
//  CARTRIDGE GENERATOR PROMPT — system + user prompts that turn a one-sentence
//  description into a valid CartridgeSpec JSON via the platform LLM.
//
//  The system prompt teaches the LLM the CartridgeSpec schema, valid enumerations,
//  palette/recolor guidance, and includes a complete worked example (cat-vacuum).
//  The user prompt is a single-line wrapper around the input sentence.
// ============================================================================

const WORKED_EXAMPLE = JSON.stringify(
  {
    id: 'cat-vacuum',
    copy: {
      en: {
        title: 'FUR FLOOD',
        subtitle: 'CAT VS ROBOT VACUUMS · AUTO-SWIPE · ENDLESS WAVES',
        introSub: 'DEFEND YOUR NAP SPOT',
        tapToStart: 'POUNCE IN',
        again: 'ANOTHER CATNAP',
        ruleExplore:
          'Move with the stick — your cat auto-swipes the nearest vacuum.',
        ruleCrystals:
          'Every vacuum drops a treat — walk over it to score.',
        ruleDark:
          '9 lives. Endless waves — boss vacuum every 3rd wave, meaner each time.',
      },
      zh: {
        title: 'FUR FLOOD',
        subtitle: '猫 vs 扫地机器人 · 自动出爪 · 无限波次',
        introSub: '守住你的午睡角落',
        tapToStart: '开挠',
        again: '再睡一觉',
        ruleExplore: '摇杆移动 · 猫猫自动挠最近的扫地机',
        ruleCrystals: '每干掉一台扫地机掉一颗猫粮 · 走过去吃掉 = 加分',
        ruleDark: '9 条命 · 每 3 波出一台巨型吸尘器，一波比一波凶',
      },
    },
    palette: [
      {
        name: 'Morning Sunbeam',
        colors: {
          floor: '#f2e8d5',
          fog: '#fffaf2',
          ambient: '#fff5e6',
          hemiSky: '#ffe0b2',
          hemiGround: '#d7ccc8',
          pillar: '#e8d5b7',
        },
      },
      {
        name: 'Afternoon Dust',
        colors: {
          floor: '#e8d5b7',
          fog: '#faf5ed',
          ambient: '#ffe0b2',
          hemiSky: '#ffcc80',
          hemiGround: '#bcaaa4',
          pillar: '#d7ccc8',
        },
      },
      {
        name: 'Evening Red Alert',
        colors: {
          floor: '#c9a87c',
          fog: '#f0e0d0',
          ambient: '#ff8a65',
          hemiSky: '#ff5722',
          hemiGround: '#8d6e63',
          pillar: '#a1887f',
        },
      },
    ],
    enemies: {
      lurker: { creature: 'zombie', name: 'Roomba', recolor: '#d0d0d8' },
      runner: { creature: 'werewolf', name: 'Stick Vac', recolor: '#585860' },
      brute: { creature: 'skeleton', name: 'Canister Vac', recolor: '#f0ece4' },
      stalker: { creature: 'mummy', name: 'Carpet Cleaner', recolor: '#e8dcc8' },
      exploder: { creature: 'ghost', name: 'Dust Buster', recolor: '#ffeae0' },
      ghost: { creature: 'zombie', name: 'Handheld Turbo', recolor: '#a8c8e8' },
    },
    bossLadder: [
      { behavior: 'vampire', skin: 'mech', name: 'Dyson Beast' },
      { behavior: 'minotaur', skin: 'firefighter', name: 'Industrial Scrubber' },
      { behavior: 'mech', skin: 'mech', name: 'Wet/Dry Titan' },
      { behavior: 'viking', skin: 'swat', name: 'ShopVac Warrior' },
      { behavior: 'punk', skin: 'biker', name: 'Handheld Turbo' },
      { behavior: 'cop', skin: 'cop', name: 'RoboMop Squad' },
      { behavior: 'cowboy', skin: 'cowboy', name: 'Steam Cleaner' },
      { behavior: 'goth', skin: 'goth', name: 'Auto-Empty Dock' },
      { behavior: 'biker', skin: 'biker', name: 'Cordless Stick' },
      { behavior: 'firefighter', skin: 'firefighter', name: 'Wet Floor Bot' },
    ],
    heroes: [
      { id: 'tabby', label: 'TABBY', tint: '#c8a050' },
      { id: 'tuxedo', label: 'TUXEDO', tint: '#1c1c1c' },
      { id: 'ginger', label: 'GINGER', tint: '#e89440' },
      { id: 'siamese', label: 'SIAMESE', tint: '#d4c4b0' },
      { id: 'calico', label: 'CALICO', tint: '#f0e0d0' },
      { id: 'void', label: 'VOID', tint: '#0a0a0c' },
      { id: 'sphynx', label: 'SPHYNX', tint: '#e8d0c0' },
      { id: 'tiger', label: 'TIGER', tint: '#e08020' },
    ],
    starterHeroIds: ['tabby', 'tuxedo', 'ginger'],
    heroUnlockPrice: 200,
    audioMood: 0.25,
    photoHero: true,
    visuals: {
      heroKind: 'cat',
      enemySet: 'household',
      actionStyle: 'cat-swipe',
      worldProps: 'living-room',
      debrisStyle: 'household',
    },
    feel: {
      combatProfile: 'close-swipe',
    },
  },
  null,
  2,
);

export function buildSystemPrompt(): string {
  return `You are a game theme designer. Given ONE SENTENCE describing a survival scenario, output a valid CartridgeSpec JSON that themes a top-down survival game engine.

The engine handles ALL gameplay (HP, speed, damage, spawn rates, difficulty curve). You provide ONLY the theme: names, colors, creature assignments, and copy text. You CANNOT change how hard the game is.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEMA — every field you must output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "id": string,                    // kebab-case slug, e.g. "cat-vacuum"
  "copy": { "en": {...}, "zh": {...} },  // see copy fields below
  "palette": [...],                // EXACTLY 3 entries
  "enemies": {...},                // EXACTLY 6 entries (one per NonBossRole)
  "bossLadder": [...],             // at least 1 entry, recommended 10
  "heroes": [...],                 // at least 1 entry, recommended 6-8
  "starterHeroIds": [...],         // subset of hero ids, 2-3 recommended
  "heroUnlockPrice": number,       // typically 200
  "audioMood": number,             // 0..1, default 0.3 (0=quiet, 1=constant)
  "photoHero": true,               // always true unless the theme has no face
  "visuals": {...},                // semantic presentation family, see below
  "feel": {...}                    // bounded hand-tuned feel preset, see below
}

COPY FIELDS (8 per locale — en AND zh required):
  "title"       — short punchy ALL-CAPS game name (max 20 chars)
  "subtitle"    — tagline describing the premise
  "introSub"    — short call to action shown on splash (< 30 chars)
  "tapToStart"  — button label to start the game (2-3 words, ALL-CAPS)
  "again"       — button label to replay (2-3 words, ALL-CAPS)
  "ruleExplore" — one sentence: how to move + auto-fire mechanic
  "ruleCrystals"— one sentence: what you collect + what it does
  "ruleDark"    — one sentence: lives system + boss cadence

PALETTE (exactly 3 entries, each with name + 6 hex colors):
Each entry: { "name": string, "colors": { "floor", "fog", "ambient", "hemiSky", "hemiGround", "pillar" } }
- floor: ground plane color
- fog: distance fade (darker = claustrophobic, lighter = open)
- ambient: global scene tint
- hemiSky: top-down hemisphere light
- hemiGround: bottom-up hemisphere light (ground bounce)
- pillar: obstacle/prop tint
The engine rotates through these 3 by (level-1) % 3. First = early/calm. Second = mid-game escalation. Third = peak danger.
All hex MUST be 6 characters after # (NO 3-digit shorthand like #abc).

ENEMIES (exactly 6 NonBossRoles — ALL required):
Valid creature keys: "zombie" | "werewolf" | "skeleton" | "mummy" | "ghost"
Each enemy: { "creature": string, "name": string, "recolor"?: string }
- creature: one of the 5 valid keys above
- name: themed display name (1-3 words)
- recolor: optional hex to hue-shift the creature toward the theme

BOSS LADDER (at least 1, recommended 10 rungs):
Valid boss behaviours: "vampire" | "swat" | "mech" | "minotaur" | "viking" | "punk" | "cop" | "cowboy" | "goth" | "biker" | "firefighter"
Valid boss skins: same list as behaviours.
Each rung: { "behavior": string, "skin": string, "name": string }
Order from weakest/earliest boss to strongest/latest. Each behavior should appear at most once unless you intentionally repeat.
- behavior controls the engine-owned AI move: melee / charge / beam / shield / summon / burstfire / blink / flank / rage.
- skin controls only the visual builder.
- name is the themed display label.
Back-compat note: old specs may use { "kind": "mech", "name": "..." }, but new specs should use behavior + skin.

HEROES (at least 1, recommended 6-8):
Each hero: { "id": string, "label": string, "tint": string }
- id: kebab-case slug unique within this cartridge
- label: short ALL-CAPS display name (1-2 words)
- tint: hex swatch used in the store chip — pick a color that matches the label

VISUALS (required for semantic themes, optional only for ordinary human-vs-creature themes):
{
  "heroKind": "survivor" | "cat",
  "enemySet": "creature" | "vacuum" | "household",
  "actionStyle": "weapon" | "cat-swipe",
  "worldProps": "street" | "living-room",
  "debrisStyle": "gore" | "household"
}

This is the v2 semantic layer. Use it whenever the sentence implies a non-human hero,
a non-creature enemy family, or a non-street setting. It changes ONLY presentation,
never gameplay tuning.
- Cat / kitten / pet hero → heroKind "cat", actionStyle "cat-swipe".
- Robot vacuum / Roomba / cleaner appliance enemies → enemySet "vacuum".
- Cat-at-home scenarios with varied household hazards → enemySet "household" and debrisStyle "household".
- Home / apartment / couch / carpet / nap-spot premise → worldProps "living-room".
- Human survivor with monsters in a city/street → survivor + creature + weapon + street.

Do not leave a human gun, humanoid boss, or street props in the output when the
sentence clearly asks for an animal/appliance/home scenario. The names, copy,
heroes, enemies, bossLadder, palette, and visuals must all tell the same story.

Be bold. The generated game should feel like it truly belongs to the user's
sentence, not like a cautious reskin. If the existing visual enums are too
narrow for the theme, choose the closest valid enum in JSON and write names/copy
that expose the gap clearly; a developer/agent should then add a new visual
family or feel preset instead of forcing the theme back into the zombie/street
baseline. The standard is: a user should recognize their premise from the first
gameplay screenshot without reading the title.

FEEL (optional, recommended when the theme implies a different verb feel):
{
  "combatProfile": "survivor-shooter" | "close-swipe"
}

This is NOT raw tuning. It picks an engine-owned, hand-tested preset.
- survivor-shooter: default ranged auto-fire survival feel.
- close-swipe: short range, wider hit area, quicker cadence, for claws/punches/bites/taps.
Use close-swipe for cats, animals, boxing, melee toys, or any theme where visible long-range bullets would feel wrong.
Do not invent HP, damage, speed, spawn-rate, or cooldown numbers.

If a theme needs a feel that neither preset covers, do not pretend the old feel
is good enough. Output the closest valid preset, then a human/agent should add a
new named preset in the engine. Good future presets might include dodge-only,
beam-channel, rhythm-hop, orbiting-magic, bumper-car, or stealth-sneak.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PALETTE GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Match the palette to the sentence's mood:
- Warm/cozy (living room, kitchen, garden): creams, browns, amber, soft orange/yellow, warm whites
- Cold/dark (graveyard, dungeon, night): dark blues, purples, deep grays, muted violets, near-black fog
- Bright/silly (playground, candy, toy store): pastels, primary colors, high contrast, colorful fog
- Nature/outdoors (forest, farm, beach): greens, earth tones, sky blues, sandy browns
- Industrial/mechanical (factory, spaceship, lab): grays, steel blues, amber hazard, cold whites
- Alien/surreal (dream, other dimension, underwater): unusual color combos, high saturation shifts

The 3-palette cycle should tell a story: calm → escalation → climax.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOLOR GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recolor is the cheapest reskin tool. It hue-shifts a creature while keeping its own saturation/lightness. Pick the hex that makes the creature immediately read as the themed object:
- Silver/white (#d0d0d8, #f0f0f0): robots, appliances, ghosts, ice
- Dark gray (#404050, #585860): machines, shadows, tanks
- Cream/beige (#f0ece4, #e8dcc8): household items, sand, bone
- Red/orange (#e04030, #ff6020): fire, lava, hazard, berserker
- Green (#40a040, #80c060): nature, slime, poison, alien
- Blue (#4060c0, #80a0e0): water, ice, electric, ghost
- Purple (#8040c0, #c080e0): magic, void, psychic, alien
- Yellow/amber (#e0c040, #ffb020): gold, electric, hazard, holy

The recolor should be the dominant visual color. A zombie recolor #d0d0d8 = silver Roomba; a skeleton recolor #f0ece4 = cream canister.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKED EXAMPLE — "a cat surviving a flood of robot vacuums"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${WORKED_EXAMPLE}

Notice how the example:
- Maps each NonBossRole to a creature + themed name + recolor (same creature can appear twice with different recolors)
- Boss ladder separates behaviour from skin, so "Dyson Beast" can use safe vampire melee behaviour with a mech visual
- Adds visuals + feel.combatProfile so the player sees a cat, household hazards, paw-swipe VFX, living-room props, non-gory debris, and short-range swipe feel
- Palette progresses warm sunbeam → dusty afternoon → red-alert evening
- Heroes are cat breeds — short ALL-CAPS labels, kebab-case ids, coat-matching tints
- Copy is playful, short, ALL-CAPS for buttons, descriptive for rules
- Both en and zh locales use the same title, matching tone in each language

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY the JSON object. The first character MUST be { and the last character MUST be }.
No markdown fences. No prose before or after. No explanation. Just the JSON, parseable by JSON.parse() with zero syntax errors.

All strings must be double-quoted. No trailing commas. Hex colors must be lowercase.`;
}

export function buildUserPrompt(sentence: string): string {
  return `Theme sentence: "${sentence}"

Generate a complete CartridgeSpec JSON for this theme. Remember: output ONLY the JSON object, no markdown, no prose.`;
}
