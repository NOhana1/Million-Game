// The watchdog. Checks that the game is up AND that orders are being filled on time, then opens
// one GitHub issue when something fails, which GitHub emails to the owner.
//
// It only reads from the game: every request it sends is a GET, so it can't place orders, move
// money or touch the clock. See "Watchdog" in the README for what it checks and how to fix things.
//
// Settings (all optional):
//   SITE_URL       the game to check, default the live site
//   VERCEL_BYPASS  lets a test run past the login on a preview
//   SEND_ALERT     "true" to open, update and close the alert issue; anything else only reports
//   GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_URL   given by GitHub Actions

import { appendFileSync } from 'node:fs';

const SITE_URL = (process.env.SITE_URL ?? 'https://million-game-three.vercel.app').replace(/\/$/, '');
const { VERCEL_BYPASS, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_URL, GITHUB_STEP_SUMMARY } = process.env;
const SEND_ALERT = process.env.SEND_ALERT === 'true';

const OWNER = 'NOhana1'; // mentioned in the alert, so GitHub surely emails them
const LABEL = 'watchdog';
const TRIES = 3; // a check fails only if it fails this many times in a row
const RETRY_MS = 20_000;
const FRESH_MS = 5 * 60_000; // a status answer older than this is itself a problem
const README = 'https://github.com/NOhana1/Million-Game#watchdog';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Reads from the game. GET only, so nothing in the game can change. */
async function read(path) {
  const headers = VERCEL_BYPASS ? { 'x-vercel-protection-bypass': VERCEL_BYPASS } : {};
  const response = await fetch(`${SITE_URL}${path}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // the page itself is HTML
  }
  return { status: response.status, text, json };
}

const minutes = (seconds) => `${Math.round(seconds / 60)} min`;

/** Each check returns a problem in plain words, or null when all is well. */
export const CHECKS = [
  {
    name: 'Website loads',
    async run() {
      const page = await read('/');
      if (page.status !== 200) return `The home page answered ${page.status}.`;
      if (!page.text.includes('<title>Portfolio League</title>')) return 'The home page loaded, but it isn’t the game.';
      return null;
    },
  },
  {
    name: 'Server answers',
    async run() {
      const health = await read('/api/health');
      if (health.status !== 200 || health.json?.ok !== true) return `The health check answered ${health.status}.`;
      return null;
    },
  },
  {
    name: 'Database answers',
    async run() {
      const world = await read('/api/world');
      if (world.status !== 200 || typeof world.json?.worldTime !== 'number') {
        return `Market data answered ${world.status}. The database may be down or out of free quota.`;
      }
      return null;
    },
  },
  {
    name: 'Orders fill on time',
    async run(now = Date.now()) {
      const status = await read('/api/status');
      if (status.status !== 200 || !status.json?.fills) return `The status check answered ${status.status}.`;
      const { checkedAt, fills } = status.json;
      if (now - checkedAt > FRESH_MS) return `The status answer is ${minutes((now - checkedAt) / 1000)} old.`;
      if (fills.overdueOrders) return 'At least one order has been due for more than 10 minutes and still isn’t filled.';
      if (fills.late) return `A market open or close passed ${minutes(fills.slotLateSeconds)} ago and hasn’t been worked through.`;
      return null;
    },
  },
];

/** Runs every check, retrying a failing one before believing it. */
export async function runChecks(checks = CHECKS, retryMs = RETRY_MS) {
  const results = [];
  for (const check of checks) {
    let problem = null;
    for (let attempt = 1; attempt <= TRIES; attempt += 1) {
      problem = await check.run().catch((error) => `Couldn’t reach it: ${error.message}`);
      if (!problem) break;
      if (attempt < TRIES) await sleep(retryMs);
    }
    results.push({ name: check.name, ok: !problem, problem });
  }
  return results;
}

const israelTime = (at) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);

/** The failing checks, kept in the issue so a repeat of the same failure stays quiet. */
const MARK = /<!-- failing: (.*) -->/;
const failingKey = (results) => results.filter((r) => !r.ok).map((r) => r.name).join(', ');

export function alertBody(results, at, runUrl) {
  const rows = results.map((r) => `| ${r.ok ? '✅' : '❌'} ${r.name} | ${r.ok ? 'OK' : r.problem} |`);
  return [
    `@${OWNER} the watchdog found a problem with ${SITE_URL}.`,
    '',
    `**When:** ${israelTime(at)} Israel time (${new Date(at).toISOString()})`,
    '',
    '| Check | Result |',
    '|---|---|',
    ...rows,
    '',
    runUrl ? `**Details:** ${runUrl}` : '',
    `**What to do:** ${README}`,
    '',
    'This issue stays open while the problem lasts. You get one more email if a different check fails, and one when everything is back to normal. Nothing is sent for the same failure again.',
    '',
    `<!-- failing: ${failingKey(results)} -->`,
  ].join('\n');
}

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path} answered ${response.status}`);
  return response.json();
}

/**
 * Decides what to tell the owner. Pure, so it can be tested: given the results and the open
 * alert (or null), it says whether to open one, add a note, close it, or stay quiet.
 */
export function decide(results, openIssue) {
  const failing = failingKey(results);
  if (!failing) return openIssue ? 'close' : 'quiet';
  if (!openIssue) return 'open';
  const before = openIssue.body?.match(MARK)?.[1] ?? '';
  return before === failing ? 'quiet' : 'update';
}

async function alert(results, at) {
  const [openIssue = null] = await github(`/issues?labels=${LABEL}&state=open&per_page=1`);
  const action = decide(results, openIssue);
  const failing = failingKey(results);
  if (action === 'open') {
    const issue = await github('/issues', {
      method: 'POST',
      body: { title: `Watchdog: ${failing}`, body: alertBody(results, at, GITHUB_RUN_URL), labels: [LABEL] },
    });
    console.log(`Opened alert #${issue.number}`);
  } else if (action === 'update') {
    const number = openIssue.number;
    await github(`/issues/${number}`, {
      method: 'PATCH',
      body: { title: `Watchdog: ${failing}`, body: alertBody(results, at, GITHUB_RUN_URL) },
    });
    await github(`/issues/${number}/comments`, {
      method: 'POST',
      body: { body: `Something else is failing now (${israelTime(at)} Israel time): ${failing}.` },
    });
    console.log(`Updated alert #${number}`);
  } else if (action === 'close') {
    const number = openIssue.number;
    await github(`/issues/${number}/comments`, {
      method: 'POST',
      body: { body: `✅ Everything is back to normal (${israelTime(at)} Israel time). Closing.` },
    });
    await github(`/issues/${number}`, { method: 'PATCH', body: { state: 'closed' } });
    console.log(`Closed alert #${number}`);
  } else {
    console.log(openIssue ? `Same failure as alert #${openIssue.number}, nothing new sent.` : 'All good, nothing to send.');
  }
}

async function main() {
  const at = Date.now();
  console.log(`Checking ${SITE_URL} at ${israelTime(at)} Israel time`);
  const results = await runChecks();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `: ${r.problem}`}`);

  if (GITHUB_STEP_SUMMARY) {
    appendFileSync(GITHUB_STEP_SUMMARY, `## Watchdog: ${SITE_URL}\n\n${alertBody(results, at, '')}\n`);
  }
  if (SEND_ALERT) await alert(results, at);
  else console.log('Report only: no alert sent (SEND_ALERT is not "true").');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // Only the watchdog itself breaking ends here. A failing check doesn't, so GitHub's own
    // "run failed" email doesn't repeat every 15 minutes on top of the alert issue.
    console.error(error);
    process.exit(1);
  });
}
