// Real business headlines for the moving strip, only the ones about money and markets. The server fetches them so that browsers don't
// need the feed's permission, and only titles and links ever reach a player. No database is used.

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { cachedFor } from './market.ts';

const FEED = 'https://feeds.bbci.co.uk/news/business/rss.xml';
const SOURCE = 'BBC News';
const FRESH_MS = 10 * 60 * 1000;
const WAIT_MS = 5000;
const MOST_HEADLINES = 20;

// The feed is "business", but it also carries crime, gossip and features. The strip sits next to
// a trading game, so it keeps headlines about money and markets, and drops crime and scandal even
// when they mention money.
const ABOUT_MONEY =
  /\b(markets?|stocks?|shares?|shareholders?|investors?|invest\w*|funds?|bonds?|rates?|inflation|econom\w*|gdp|growth|recession|banks?|banking|prices?|costs?|oil|gas|energy|dollar|pounds?|euro|currenc\w*|crypto\w*|bitcoin|tariffs?|trade|trading|exports?|imports?|tax\w*|budget|debt|profits?|loss(es)?|earnings|revenue|sales|unemployment|wages?|pay|salar\w*|mortgages?|pensions?|savings|retail\w*|firms?|compan\w*|business\w*|nasdaq|dow|ftse|wall street|fed|ipo|takeover|merger|deals?|billion|million|chips?|spending|bills?|money)\b|[$£€%]/i;
const OFF_TOPIC =
  /\b(affairs?|spy|spies|fraud|guilty|court|jail\w*|prison|arrest\w*|police|murder\w*|killed|death|dies|died|sex\w*|abuse\w*|scandal|crime|criminal|charged|trial)\b/i;

/** Whether a headline belongs next to a trading game. */
export const aboutMoney = (title: string) => ABOUT_MONEY.test(title) && !OFF_TOPIC.test(title);

export type Headline = { title: string; link: string };

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

const plain = (text: string) =>
  text
    .replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|apos|gt|lt|quot);/g, (_, name: string) => ENTITIES[name] ?? '')
    .trim();

/** Only links to the web are kept, so a strange feed can't put a script link on the page. */
export function headlinesFrom(xml: string): Headline[] {
  return [...xml.matchAll(/<item>(.*?)<\/item>/gs)]
    .map(([, item = '']) => ({
      title: plain(item.match(/<title>(.*?)<\/title>/s)?.[1] ?? ''),
      link: plain(item.match(/<link>(.*?)<\/link>/s)?.[1] ?? ''),
    }))
    .filter(({ title, link }) => aboutMoney(title) && link.startsWith('https://'))
    .slice(0, MOST_HEADLINES);
}

export function newsRoutes(deps: Deps) {
  const routes = new Hono();
  const read = deps.fetchFeed ?? fetch;
  let saved: { at: number; headlines: Headline[] } | null = null;

  routes.get('/news', async (c) => {
    const now = deps.now();
    if (!saved || now - saved.at > FRESH_MS) {
      try {
        const response = await read(FEED, { signal: AbortSignal.timeout(WAIT_MS) });
        if (!response.ok) throw new Error(`Feed answered ${response.status}`);
        saved = { at: now, headlines: headlinesFrom(await response.text()) };
      } catch (error) {
        // The strip is an extra. Old headlines are fine, and with none it simply doesn't show.
        console.error('Could not read the news feed', error);
      }
    }
    c.header('Cache-Control', cachedFor(300));
    return c.json({ source: SOURCE, headlines: saved?.headlines ?? [] });
  });

  return routes;
}
