import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { testApp } from '../testing.ts';
import { type Headline, headlinesFrom } from './news.ts';

const FEED = `<rss><channel><title>Not a story</title>
<item><title><![CDATA[Markets rise &amp; fall]]></title><link>https://example.com/a</link></item>
<item><title>Plain &#39;title&#39;</title><link>https://example.com/b</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><title></title><link>https://example.com/c</link></item>
</channel></rss>`;

type News = { source: string; headlines: Headline[] };

describe('news', () => {
  it('keeps only real stories with safe links', () => {
    assert.deepEqual(headlinesFrom(FEED), [
      { title: 'Markets rise & fall', link: 'https://example.com/a' },
      { title: "Plain 'title'", link: 'https://example.com/b' },
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
