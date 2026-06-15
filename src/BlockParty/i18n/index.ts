type Locale = 'zh' | 'en';

function detectLocale(): Locale {
  const override = localStorage.getItem('game_locale');
  if (override === 'en' || override === 'zh') return override;
  return 'en';
}

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    title: 'BLOCK PARTY',
    subtitle: '夜班街区 · 自动开火 · 撑到最后一刻',
    tap_to_start: '出门干活',
    again: '再上一晚',
    intro_sub: '撑过这一夜',
    score: '得分',
    high: '最高',
    leaderboard: '排行榜',
    loading: '加载中…',
    rule_explore: '摇杆移动 · 自动锁最近僵尸开火',
    rule_crystals: '杀僵尸掉绿水晶 · 走过去吸到 = 加分',
    rule_dark:    '3 心血量 · 被咬一口红屏闪 · boss 每三关一只，越往后越凶',
  },
  en: {
    title: 'BLOCK PARTY',
    subtitle: 'GRAVEYARD SHIFT · AUTO-FIRE · ENDLESS NIGHTS',
    intro_sub: 'SURVIVE THE NIGHT',
    tap_to_start: 'CLOCK IN',
    again: 'ONE MORE NIGHT',
    score: 'Score',
    high: 'Best',
    leaderboard: 'Leaderboard',
    loading: 'Loading…',
    rule_explore: 'Move with the stick — hero auto-fires at the nearest zombie.',
    rule_crystals: 'Every zombie drops a green XP gem — walk over it to score.',
    rule_dark:    '3 hearts. Endless nights — boss every 3rd, getting tougher.',
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
