import { CARTRIDGE } from '../cartridge';

type Locale = 'zh' | 'en';

function detectLocale(): Locale {
  const override = localStorage.getItem('game_locale');
  if (override === 'en' || override === 'zh') return override;
  return 'en';
}

// Generic chrome stays in the engine; themed strings come from the cartridge so
// a reskin only edits one file. Cartridge copy keys are camelCase; the t() keys
// stay snake_case for call-site stability.
function themed(locale: Locale): Record<string, string> {
  const c = CARTRIDGE.copy[locale];
  return {
    title:         c.title,
    subtitle:      c.subtitle,
    intro_sub:     c.introSub,
    tap_to_start:  c.tapToStart,
    again:         c.again,
    rule_explore:  c.ruleExplore,
    rule_crystals: c.ruleCrystals,
    rule_dark:     c.ruleDark,
  };
}

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    ...themed('zh'),
    score: '得分',
    high: '最高',
    leaderboard: '排行榜',
    loading: '加载中…',
  },
  en: {
    ...themed('en'),
    score: 'Score',
    high: 'Best',
    leaderboard: 'Leaderboard',
    loading: 'Loading…',
  },
};

let cur: Locale = detectLocale();
export function setLocale(l: Locale) { cur = l; localStorage.setItem('game_locale', l); }
export function t(key: string, vars?: { n?: number | string }): string {
  const raw = dict[cur][key] ?? dict.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String((vars as any)[k] ?? ''));
}
export function getLocale(): Locale { return cur; }
