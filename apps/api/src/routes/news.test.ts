import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { testApp } from '../testing.ts';
import { aboutMoney, type Headline, headlinesFrom } from './news.ts';

const FEED = `<rss><channel><title>Not a story</title>
<item><title><![CDATA[Markets rise &amp; fall]]></title><link>https://example.com/a</link></item>
<item><title>Bank&#39;s &#39;profits&#39; up</title><link>https://example.com/b</link></item>
<item><title>Bacon crisps and EU rules</title><link>https://example.com/d</link></item>
<item><title>Shares fall over CEO&#39;s affair with a spy</title><link>https://example.com/e</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><title></title><link>https://example.com/c</link></item>
</channel></rss>`;

type News = { source: string; headlines: Headline[] };

describe('news', () => {
  it('tells money news from the rest', () => {
    assert.ok(aboutMoney('Interest rates hiked to 4% in first increase in over three years'));
    assert.ok(aboutMoney('Pound rises to its highest level since the Brexit referendum'));
    assert.ok(!aboutMoney('Elon Musk appears to signal the end of the road for Cybertruck'));
    assert.ok(!aboutMoney('Civil servant who secretly held five jobs found guilty of fraud'));
    assert.ok(!aboutMoney('How a civil servant got away with juggling five jobs for so long'));
    assert.ok(!aboutMoney('Nvidia shares tumble over investigation into affair with alleged spy'));
  });

  it('keeps only stories about money, with safe links, and drops scandal', () => {
    assert.deepEqual(headlinesFrom(FEED), [
      { title: 'Markets rise & fall', link: 'https://example.com/a' },
      { title: "Bank's 'profits' up", link: 'https://example.com/b' },
    ]);
  });

  it('asks the feed once and remembers the answer', async () => {
    let reads = 0;
    const app = testApp({
      fetchFeed: async () => {
        reads += 1;
        return new Response(FEED);
      },
    });
    await app.request('/api/news');
    const news = (await (await app.request('/api/news')).json()) as News;
    assert.equal(news.headlines.length, 2);
    assert.equal(reads, 1);
  });

  it('answers with no headlines when the feed is down', async () => {
    const app = testApp({ fetchFeed: async () => new Response('', { status: 503 }) });
    const response = await app.request('/api/news');
    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as News).headlines, []);
  });
});
