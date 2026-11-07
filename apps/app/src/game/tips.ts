// The tip of the day. When something in your own portfolio is worth knowing about, the tip is
// about that. Otherwise it's one of the general lessons. A new one each day, the same all day.

import type { MarketData, Me } from '@/api/client';

const FUND = 'Fund';
const BIG_SHARE = 0.15; // the rules stop one security at 20%
const BIG_SECTOR = 0.4;
const MUCH_CASH = 0.3;
const WELL_SPREAD = 5;

const GENERAL = [
  'Your score is 85% return and 15% stability, so a steady climb can beat a wild ride.',
  'Orders fill at the next opening or closing price, not the price you see now. Plan for a little surprise either way.',
  'An index fund holds many companies at once: one purchase, a lot of spread.',
  'Selling right after a fall locks the loss in. Ask whether the reason you bought still holds.',
  'A US security moves with its own price and with the dollar. Both count in shekels here.',
  'Professionals rarely put everything on one idea. Even a great company has bad weeks.',
  'The league starts fresh every week, so one bad week is never the end of the story.',
];

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Tips about this player's own portfolio that apply right now. */
function personalTips(me: Me, market: MarketData): string[] {
  if (me.value <= 0) return [];
  const rows = new Map(market.securities.map((row) => [row.id, row]));
  const held = me.positions
    .map((position) => ({ ...position, row: rows.get(position.securityId), share: position.value / me.value }))
    .filter((p) => p.row && p.value > 0)
    .sort((a, b) => b.share - a.share);

  if (held.length === 0) {
    return [
      'All your money is still cash, and cash doesn’t grow. An index fund is an easy first step: it spreads your money over many companies.',
    ];
  }

  const tips: string[] = [];
  const top = held[0];
  if (top.share >= BIG_SHARE) {
    tips.push(
      `${top.row?.name} is ${percent(top.share)} of your portfolio. If it falls 10%, your whole portfolio falls about ${(top.share * 10).toFixed(1)}%. More securities make falls smaller, and stability is 15% of your score.`,
    );
  }

  const sectors = new Map<string, number>();
  for (const p of held) {
    if (p.row && p.row.sector !== FUND) sectors.set(p.row.sector, (sectors.get(p.row.sector) ?? 0) + p.share);
  }
  const [sector, sectorShare] = [...sectors].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (sectorShare >= BIG_SECTOR) {
    tips.push(
      `${percent(sectorShare)} of your money is in ${sector}. Companies in one sector tend to rise and fall together.`,
    );
  }

  const markets = new Set(held.map((p) => p.row?.market));
  if (markets.size === 1 && markets.has('US')) {
    tips.push(
      'Everything you hold trades in dollars. If the dollar weakens against the shekel, you lose even when prices stay the same.',
    );
  } else if (markets.size === 1 && markets.has('TASE')) {
    tips.push(
      'Everything you hold is in Tel Aviv. US securities add companies Israel doesn’t have, with some dollar risk.',
    );
  }

  const cashShare = me.cash / me.value;
  if (cashShare >= MUCH_CASH) {
    tips.push(`${percent(cashShare)} of your portfolio is cash. Cash is safe from falls, but it can’t grow.`);
  }

  if (held.length >= WELL_SPREAD && top.share < BIG_SHARE) {
    tips.push(
      `Nice spread: ${held.length} securities and none above ${percent(top.share)}. That keeps your largest fall small.`,
    );
  }
  return tips;
}

/** Today's date in Israel as a whole number of days, so everyone's tip changes at the same midnight. */
function dayNumber(realNow: number) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(realNow);
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export function tipOfTheDay(me: Me | null, market: MarketData, realNow = Date.now()) {
  const today = dayNumber(realNow);
  const personal = me ? personalTips(me, market) : [];
  const tips = personal.length > 0 ? personal : GENERAL;
  return { text: tips[today % tips.length], personal: personal.length > 0 };
}
