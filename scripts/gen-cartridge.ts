#!/usr/bin/env npx tsx
// ============================================================================
//  gen-cartridge.ts — turn a one-sentence description into a valid CartridgeSpec
//  cartridge file via the platform game-chat LLM.
//
//  Usage:
//    npx tsx scripts/gen-cartridge.ts --sentence "a cat surviving robot vacuums"
//    npx tsx scripts/gen-cartridge.ts --sentence "..." --retries 5
//    npx tsx scripts/gen-cartridge.ts --sentence "..." --sprites
//    npx tsx scripts/gen-cartridge.ts --sentence "..." --dry-run
// ============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CARTRIDGE_DIR = path.join(ROOT, 'src', 'BlockParty', 'cartridge');

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  sentence: string;
  retries: number;
  dryRun: boolean;
  sprites: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sentence: '', retries: 3, dryRun: false, sprites: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sentence' && i + 1 < argv.length) args.sentence = argv[++i];
    else if (argv[i] === '--retries' && i + 1 < argv.length) args.retries = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--sprites') args.sprites = true;
  }
  if (!args.sentence) {
    console.error('Usage: npx tsx scripts/gen-cartridge.ts --sentence "a sentence describing a survival scenario"');
    console.error('  --retries N   max LLM retries on validation failure (default 3)');
    console.error('  --sprites     generate unique sprites for each enemy via gen-image + R2 upload');
    console.error('  --dry-run     validate but do not write the output file');
    process.exit(1);
  }
  return args;
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

const CHAT_URL = 'https://chat.aiwaves.tech/aigram/api/game-chat';

async function chatOnce(system: string, user: string): Promise<string> {
  const body = JSON.stringify({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`Chat API HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? '';
}

// ─── Gen-Image & Upload ──────────────────────────────────────────────────────

const GEN_IMAGE_URL = 'https://chat.aiwaves.tech/aigram/api/gen-image';
const UPLOAD_URL = 'https://chat.aiwaves.tech/aigram/api/upload';
const API_HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://aigram.app',
};

interface GenImageResult {
  url: string;
}

async function genImage(prompt: string): Promise<string> {
  const res = await fetch(GEN_IMAGE_URL, {
    method: 'POST',
    headers: API_HEADERS,
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Gen-image API HTTP ${res.status}`);
  const json = (await res.json()) as GenImageResult;
  if (!json.url) throw new Error(`Gen-image returned no URL: ${JSON.stringify(json)}`);
  return json.url; // temporary CDN URL (~24h)
}

async function downloadImage(url: string, destPath: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return buf;
}

async function uploadToR2(filePath: string): Promise<string> {
  const blob = new Blob([fs.readFileSync(filePath)], { type: 'image/png' });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}`);
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error(`Upload returned no URL: ${JSON.stringify(json)}`);
  return json.url; // permanent R2 URL
}

// ─── Sprite generation loop ─────────────────────────────────────────────────

type NonBossRole = 'lurker' | 'runner' | 'brute' | 'stalker' | 'exploder' | 'ghost';
const NON_BOSS_ROLES: NonBossRole[] = ['lurker', 'runner', 'brute', 'stalker', 'exploder', 'ghost'];

const ROLE_SPRITE_BRIEFS: Record<NonBossRole, string> = {
  lurker: 'small basic enemy, simple readable silhouette, cautious pose',
  runner: 'lean fast enemy, dynamic forward-leaning pose, long narrow silhouette',
  brute: 'large heavy enemy, broad shoulders, chunky powerful silhouette',
  stalker: 'ranged enemy, alert aiming pose, sharp watchful silhouette',
  exploder: 'round volatile enemy, unstable core, compact explosive silhouette',
  ghost: 'airy spectral enemy, translucent edges, floating silhouette',
};

function buildSpritePrompt(role: NonBossRole, name: string, theme: string): string {
  return [
    `single isolated low-poly voxel game enemy sprite: "${name}"`,
    `theme: ${theme}`,
    `gameplay role: ${role}; ${ROLE_SPRITE_BRIEFS[role]}`,
    'three-quarter front view, full body, centered, square composition',
    'clean transparent-looking cutout on solid #222222 background',
    'high contrast readable silhouette, distinct from the other enemy roles',
    'game asset only, no environment, no scene, no poster, no text, no watermark, no logo, no UI',
  ].join(', ');
}

async function generateSprites(
  spec: Record<string, unknown>,
  slug: string,
): Promise<void> {
  const enemies = (spec.enemies ?? {}) as Record<string, { name?: string; spriteUrl?: string }>;
  const copy = spec.copy as Record<string, { title?: string }> | undefined;
  const theme = copy?.en?.title ?? slug;
  const spriteDir = path.join(ROOT, 'public', 'sprites', slug);

  let count = 0;
  for (const role of NON_BOSS_ROLES) {
    const enemy = enemies[role];
    if (!enemy) continue;
    const name = enemy.name || role;
    const prompt = buildSpritePrompt(role, name, theme);

    console.log(`  🎨  Generating sprite for ${role} (${name})...`);
    let tempUrl: string;
    try {
      tempUrl = await genImage(prompt);
    } catch (e) {
      console.error(`     ⚠️  Gen-image failed for ${role}: ${e}. Skipping.`);
      continue;
    }

    const localPath = path.join(spriteDir, `${role}.png`);
    try {
      await downloadImage(tempUrl, localPath);
      console.log(`     📥  Downloaded → ${path.relative(ROOT, localPath)}`);
    } catch (e) {
      console.error(`     ⚠️  Download failed for ${role}: ${e}. Skipping.`);
      continue;
    }

    console.log(`     ☁️  Uploading to R2...`);
    try {
      const permanentUrl = await uploadToR2(localPath);
      enemy.spriteUrl = permanentUrl;
      console.log(`     ✅  R2: ${permanentUrl.slice(0, 60)}...`);
      count++;
    } catch (e) {
      console.error(`     ⚠️  Upload failed for ${role}: ${e}. Keeping local only.`);
      // Fallback: use relative path for local dev
      enemy.spriteUrl = `/sprites/${slug}/${role}.png`;
    }

    // Rate-limit safety: ~1 req/sec natural pacing (each call takes 3-10s)
  }

  console.log(`  🖼️  ${count}/${NON_BOSS_ROLES.length} sprites generated and uploaded.`);
  if (count < NON_BOSS_ROLES.length) {
    console.log(`  📁  Local sprites saved to public/sprites/${slug}/`);
  }
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;

  // Strategy 1: direct parse
  {
    const trimmed = raw.trim();
    try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* fall through */ }
  }

  // Strategy 2: strip markdown fences
  {
    let s = raw.trim();
    s = s.replace(/^```(?:json)?\s*\n?/gim, '').replace(/\n?```\s*$/gim, '').trim();
    try { return JSON.parse(s) as Record<string, unknown>; } catch { /* fall through */ }
  }

  // Strategy 3: find first { and matching } with a depth counter
  {
    const start = raw.indexOf('{');
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < raw.length; i++) {
        const ch = raw[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>; } catch { /* fall through */ }
            break;
          }
        }
      }
    }
  }

  return null;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

function applyDefaults(spec: Record<string, unknown>): void {
  if (spec.audioMood === undefined) spec.audioMood = 0.3;
  if (spec.photoHero === undefined) spec.photoHero = true;
  if (spec.heroUnlockPrice === undefined) spec.heroUnlockPrice = 200;
  const heroes = spec.heroes as Array<{ id?: string }> | undefined;
  const starterHeroIds = spec.starterHeroIds as string[] | undefined;
  if (!starterHeroIds || starterHeroIds.length === 0) {
    const firstId = heroes?.[0]?.id;
    spec.starterHeroIds = firstId ? [firstId] : ['hero-1'];
  }
}

// ─── Pascal case ─────────────────────────────────────────────────────────────

function pascalCase(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`📝  Sentence: "${args.sentence}"`);
  console.log(`🔄  Max retries: ${args.retries}`);
  if (args.dryRun) console.log('🧪  Dry run — will NOT write file');
  console.log();

  // Dynamic imports so tsx resolves .ts paths relative to the script
  const [{ buildSystemPrompt, buildUserPrompt }, { validateSpec }] =
    await Promise.all([
      import(path.join(CARTRIDGE_DIR, 'generator-prompt.ts')),
      import(path.join(CARTRIDGE_DIR, 'resolve.ts')),
    ]);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(args.sentence);

  let bestSpec: Record<string, unknown> | null = null;
  let bestErrors: string[] = [];
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  for (let attempt = 0; attempt <= args.retries; attempt++) {
    console.log(`🤖  LLM call ${attempt + 1}/${args.retries + 1}...`);

    const raw = await chatOnce(
      attempt === 0 ? systemPrompt : systemPrompt + '\n\nThe previous attempt had validation errors. Fix them.',
      attempt === 0
        ? userPrompt
        : userPrompt +
            `\n\nYour previous output had these validation errors:\n${bestErrors.map((e) => `- ${e}`).join('\n')}\n\nFix ALL errors and output ONLY the corrected JSON.`,
    );

    const spec = extractJson(raw);
    if (!spec) {
      console.error('  ❌ Could not extract JSON from LLM response.');
      console.error(`  Raw (first 200 chars): ${raw.slice(0, 200)}`);
      if (attempt < args.retries) continue;
      console.error('  No retries left. Exiting.');
      process.exit(1);
    }

    applyDefaults(spec);
    const errors = validateSpec(spec);
    bestSpec = spec;
    bestErrors = errors;

    if (errors.length === 0) {
      console.log('  ✅ Valid CartridgeSpec!');
      break;
    }

    console.error(`  ⚠️  ${errors.length} validation error(s):`);
    errors.forEach((e) => console.error(`     - ${e}`));
    if (attempt < args.retries) {
      console.log('  🔄  Retrying with error feedback...');
    }
  }

  if (!bestSpec) {
    console.error('❌ Failed to produce any spec. Exiting.');
    process.exit(1);
  }

  if (bestErrors.length > 0) {
    console.error(`❌ Still ${bestErrors.length} error(s) after all retries. Best attempt:`);
    console.error(JSON.stringify(bestSpec, null, 2));
    process.exit(1);
  }

  const spec = bestSpec;
  const slug = String(spec.id || 'generated').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // ── Sprite generation ──────────────────────────────────────────────────
  if (args.sprites) {
    console.log(`\n🖼️  Generating sprites for ${NON_BOSS_ROLES.length} enemy roles...`);
    await generateSprites(spec, slug);
  }

  const varName = `gen${pascalCase(slug)}Spec`;
  const outPath = path.join(CARTRIDGE_DIR, `gen-${slug}.ts`);

  const tsContent = [
    `// Generated from: "${args.sentence}"`,
    `// Generated at: ${new Date().toISOString()}`,
    `// Validation: passed`,
    ``,
    `import type { CartridgeSpec } from './spec';`,
    ``,
    `export const ${varName}: CartridgeSpec = ${JSON.stringify(spec, null, 2)};`,
    ``,
  ].join('\n');

  if (args.dryRun) {
    console.log('\n🧪  Dry run — would write:');
    console.log(`    Path: ${path.relative(ROOT, outPath)}`);
    console.log(`    Export: ${varName}`);
    console.log(tsContent);
    console.log('\n✅ Dry run complete. Remove --dry-run to write the file.');
    return;
  }

  fs.writeFileSync(outPath, tsContent, 'utf-8');
  console.log(`\n📄  Written: ${path.relative(ROOT, outPath)}`);
  console.log(`    Export: ${varName}`);
  console.log();

  // Summary
  const copy = spec.copy as Record<string, Record<string, string>>;
  const palette = spec.palette as Array<{ name: string }>;
  const enemies = spec.enemies as Record<string, { name: string }>;
  const bossLadder = spec.bossLadder as Array<{ name: string }>;
  const heroes = spec.heroes as Array<{ label: string }>;
  const starters = spec.starterHeroIds as string[];

  console.log('━'.repeat(60));
  console.log(`🎮  ${copy?.en?.title ?? '???'}`);
  console.log(`    ${copy?.en?.subtitle ?? ''}`);
  console.log('━'.repeat(60));
  console.log(`🪪  ID:       ${spec.id}`);
  console.log(`🎨  Palette:  ${palette?.map((p) => p.name).join(' → ') ?? '???'}`);
  console.log(`👾  Enemies:  ${Object.entries(enemies ?? {}).map(([r, e]) => `${r}=${e.name}`).join(', ')}`);
  console.log(`👑  Bosses:   ${bossLadder?.length ?? 0} rung ladder`);
  console.log(`🐱  Heroes:   ${heroes?.length ?? 0} skins (${starters?.length ?? 0} starter)`);
  console.log(`🔊  Audio:    ${spec.audioMood}`);
  console.log(`📸  PhotoHero: ${spec.photoHero}`);
  console.log('━'.repeat(60));
  console.log();
  console.log('To play: update src/BlockParty/cartridge/index.ts:');
  console.log(`  import { ${varName} } from './gen-${slug}';`);
  console.log(`  export const CARTRIDGE = specToCartridge(${varName});`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
