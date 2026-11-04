// Trading hours. Sessions are defined in each market's own time zone, so daylight saving
// changes are handled by the time zone database and never by fixed offsets.

export type Market = 'TASE' | 'US';

export const MARKETS: readonly Market[] = ['TASE', 'US'];

export type Execution = { kind: 'open' | 'close'; at: number };

const TIME_ZONES: Record<Market, string> = {
  TASE: 'Asia/Jerusalem',
  US: 'America/New_York',
};

const clockFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

const CLOCKS: Record<Market, Intl.DateTimeFormat> = {
  TASE: clockFormat(TIME_ZONES.TASE),
  US: clockFormat(TIME_ZONES.US),
};

const minutes = (hour: number, minute: number) => hour * 60 + minute;

/** The open and close minutes for a weekday, or null when the market doesn't trade. */
function session(market: Market, day: string): [number, number] | null {
  if (day === 'Sat' || day === 'Sun') return null;
  if (market === 'US') return [minutes(9, 30), minutes(16, 0)];
  return [minutes(10, 0), day === 'Fri' ? minutes(13, 50) : minutes(17, 30)];
}

function localTime(market: Market, ms: number) {
  const parts = CLOCKS[market].formatToParts(ms);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: part('weekday'), now: minutes(Number(part('hour')), Number(part('minute'))) };
}

/** Open is inclusive and close is exclusive. */
export function isMarketOpen(market: Market, ms: number): boolean {
  const { day, now } = localTime(market, ms);
  const hours = session(market, day);
  return hours !== null && now >= hours[0] && now < hours[1];
}

// Every open and close falls on a 10 minute boundary, so scanning in 10 minute steps is exact.
const GRID_MS = 10 * 60 * 1000;

const nextGridPoint = (ms: number) => Math.floor(ms / GRID_MS) * GRID_MS + GRID_MS;

/** The next moment the market opens or closes, strictly after `ms`. */
export function nextSessionChange(market: Market, ms: number): number {
  const open = isMarketOpen(market, ms);
  let t = nextGridPoint(ms);
  while (isMarketOpen(market, t) === open) t += GRID_MS;
  return t;
}

/** The next open or close of any market, strictly after `ms`. */
export function nextMarketEvent(ms: number): number {
  return Math.min(...MARKETS.map((market) => nextSessionChange(market, ms)));
}

/** Rule 3: an order executes at the next close if the market is open, else at the next open. */
export function executionFor(market: Market, placedAt: number): Execution {
  return {
    kind: isMarketOpen(market, placedAt) ? 'close' : 'open',
    at: nextSessionChange(market, placedAt),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function isWeekClose(ms: number): boolean {
  const { day, now } = localTime('US', ms);
  return day === 'Fri' && now === session('US', day)?.[1] && ms % MINUTE_MS === 0;
}

/** The game week ends at the Friday US close. That exact moment belongs to the ending week. */
export function weekEndFor(ms: number): number {
  let t = ms;
  while (!isWeekClose(t)) t = nextSessionChange('US', t);
  return t;
}

/** The previous Friday US close. Eight days back always lands in the week before. */
export const weekStartFor = (ms: number) => weekEndFor(weekEndFor(ms) - 8 * DAY_MS);
