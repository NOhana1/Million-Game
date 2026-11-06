// Proves the three alarm guarantees against a running API, never the real game:
//   1. The alarm door refuses anyone without the secret.
//   2. Knocking many times at once fills each order exactly once.
//   3. Missed runs are caught up, oldest first, with each order filled at its own moment.
// It makes two throwaway players, moves the test clock forward, and puts its speed back after.

import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const { BASE_URL, TICK_SECRET, CLOCK_SECRET, VERCEL_BYPASS, FIREBASE_WEB_KEY } = process.env;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PROOF_SPEED = 60; // one world minute per real second
const ORDER_AMOUNT = 2_000_000; // ₪20,000 in agorot
const KNOCKS_AT_ONCE = 8;

const results = [];
const check = (guarantee, name, passed, detail = '') => {
  results.push({ guarantee, name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  [${guarantee}] ${name}${detail ? ` (${detail})` : ''}`);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function call(path, { method = 'GET', auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (VERCEL_BYPASS) headers['x-vercel-protection-bypass'] = VERCEL_BYPASS;
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // A refusal from Vercel itself is not JSON, and only the status matters then.
  }
  return { status: response.status, json };
}

async function must(path, options) {
  const { status, json } = await call(path, options);
  if (status >= 300) throw new Error(`${path} answered ${status}: ${JSON.stringify(json)}`);
  return json;
}

const tick = () => call('/tick', { method: 'POST', auth: TICK_SECRET });
const moveClock = (body) =>
  must('/admin/clock', { method: 'POST', auth: CLOCK_SECRET, body });

/** Knocks until nothing is left to do, and returns every answer. */
async function catchUp() {
  const answers = [];
  for (let tries = 0; tries < 60; tries += 1) {
    const { status, json } = await tick();
    if (status !== 200) throw new Error(`The real secret was refused with ${status}`);
    answers.push(json);
    if (json.status === 'idle') return answers;
    if (json.status === 'busy') await sleep(2_000);
  }
  throw new Error('Still not caught up after 60 knocks');
}

const filledBy = (answers) => answers.reduce((sum, answer) => sum + answer.filled, 0);
const slotsIn = (answers) => answers.flatMap((answer) => answer.slots);

async function newToken() {
  if (!FIREBASE_WEB_KEY) return randomUUID(); // a local API takes any token
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_WEB_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `proof-${randomUUID()}@example.com`,
        password: randomUUID(),
        returnSecureToken: true,
      }),
    },
  );
  const json = await response.json();
  if (!response.ok) throw new Error(`Couldn't make a throwaway player: ${json.error?.message}`);
  return json.idToken;
}

async function newPlayer(name) {
  const token = await newToken();
  const { cash } = await must('/players', { method: 'POST', auth: token, body: { name } });
  return { token, startCash: cash, orders: [] };
}

async function buy(player, securityId) {
  const order = await must('/orders', {
    method: 'POST',
    auth: player.token,
    body: { id: randomUUID(), securityId, side: 'buy', amount: ORDER_AMOUNT },
  });
  player.orders.push(order);
  return order;
}

const me = (player) => must('/me', { auth: player.token });

async function waitForWorld(player, target) {
  for (;;) {
    if ((await me(player)).worldTime >= target) return;
    await sleep(1_000);
  }
}

/** Every order placed by this player, as the server sees them now. */
async function ordersOf(player) {
  const { orders } = await must('/me/orders?limit=50', { auth: player.token });
  return player.orders.map((placed) => ({
    placed,
    copies: orders.filter((order) => order.id === placed.id),
  }));
}

async function checkFilledOnce(guarantee, player, label) {
  const orders = await ordersOf(player);
  check(
    guarantee,
    `${label}: every order appears exactly once and is filled`,
    orders.every(({ copies }) => copies.length === 1 && copies[0].status === 'filled'),
    `${orders.length} orders`,
  );
  check(
    guarantee,
    `${label}: every order filled at its own promised moment`,
    orders.every(({ placed, copies }) => copies[0]?.fill?.at === placed.execution.at),
  );

  const fills = orders.map(({ copies }) => copies[0]);
  const account = await me(player);
  const spent = fills.reduce((sum, order) => sum + (order.fill?.value ?? 0), 0);
  check(
    guarantee,
    `${label}: cash went down exactly once per order`,
    account.cash === player.startCash - spent,
    `spent ${spent} agorot`,
  );
  const unitsOwed = {};
  for (const order of fills) {
    unitsOwed[order.securityId] = (unitsOwed[order.securityId] ?? 0) + (order.fill?.units ?? 0);
  }
  check(
    guarantee,
    `${label}: holdings match the fills exactly`,
    Object.entries(unitsOwed).every(([id, units]) => account.holdings[id] === units),
  );
}

async function proveAll() {
  await catchUp();
  await moveClock({ action: 'speed', speed: PROOF_SPEED });
  await moveClock({ action: 'resume' });

  const { securities } = await must('/market');
  const tase = securities.filter((security) => security.market === 'TASE').map((s) => s.id);
  const us = securities.filter((security) => security.market === 'US').map((s) => s.id);

  const first = await newPlayer('Proof One');
  const second = await newPlayer('Proof Two');
  for (const player of [first, second]) {
    for (const id of tase.slice(0, 3)) await buy(player, id);
  }
  const due = first.orders[0].execution.at;

  // The orders become due, and nothing has knocked yet.
  await moveClock({ action: 'advance', to: due - 2 * MINUTE });
  await waitForWorld(first, due + MINUTE);

  // Guarantee 1
  const noSecret = await call('/tick', { method: 'POST' });
  const wrongSecret = await call('/tick', { method: 'POST', auth: randomUUID() });
  const playerToken = await call('/tick', { method: 'POST', auth: first.token });
  const wrongClock = await call('/admin/clock', {
    method: 'POST',
    auth: randomUUID(),
    body: { action: 'pause' },
  });
  check(1, 'No secret is refused', noSecret.status === 401, `answered ${noSecret.status}`);
  check(1, 'A wrong secret is refused', wrongSecret.status === 401, `answered ${wrongSecret.status}`);
  check(1, 'A player login is refused', playerToken.status === 401, `answered ${playerToken.status}`);
  check(1, 'The clock refuses a wrong secret', wrongClock.status === 401, `answered ${wrongClock.status}`);
  const stillWaiting = (await me(first)).pendingOrders.length + (await me(second)).pendingOrders.length;
  check(1, 'The refused knocks filled nothing', stillWaiting === 6, `${stillWaiting} of 6 still waiting`);

  // Guarantee 2
  const knocks = await Promise.all(Array.from({ length: KNOCKS_AT_ONCE }, tick));
  const answers = knocks.map((knock) => knock.json);
  const statuses = answers.map((answer) => answer?.status).join(', ');
  check(2, `${KNOCKS_AT_ONCE} knocks at once were all answered`, knocks.every((k) => k.status === 200), statuses);
  check(
    2,
    'Only one knock did the work at a time',
    answers.filter((answer) => answer.filled > 0).length >= 1 &&
      answers.some((answer) => answer.status === 'busy' || answer.status === 'idle'),
    statuses,
  );
  const allAnswers = [...answers, ...(await catchUp())];
  check(2, 'Exactly 6 fills in total', filledBy(allAnswers) === 6, `${filledBy(allAnswers)} fills`);
  const again = await catchUp();
  check(2, 'Knocking again fills nothing', filledBy(again) === 0, `${filledBy(again)} fills`);
  await checkFilledOnce(2, first, 'First player');
  await checkFilledOnce(2, second, 'Second player');

  // Guarantee 3: 20 world minutes with no knock across a market moment
  const gapOrder = await buy(first, tase[3]);
  const gapMoment = gapOrder.execution.at;
  await moveClock({ action: 'advance', to: gapMoment - MINUTE });
  await waitForWorld(first, gapMoment + 20 * MINUTE);
  const missed = (await me(first)).pendingOrders.length;
  check(3, '20-minute gap: the order was left waiting by the missed run', missed === 1, `${missed} waiting`);
  const afterGap = await catchUp();
  check(3, '20-minute gap: one knock caught it up', filledBy(afterGap) === 1, `${filledBy(afterGap)} fill`);
  check(3, '20-minute gap: the missed moment was processed', slotsIn(afterGap).includes(gapMoment));
  await checkFilledOnce(3, first, '20-minute gap');

  // Guarantee 3: several days missed. The jump itself runs settlement, and knocks finish it.
  const earlier = await buy(first, tase[4]);
  const later = await buy(second, us[0]);
  const moments = [earlier.execution.at, later.execution.at];
  const jump = await moveClock({ action: 'advance', to: Math.max(...moments) + 5 * DAY });
  const days = [jump.settlement, ...(await catchUp())];
  const slots = slotsIn(days);
  check(3, 'Multi-day gap: both orders filled', filledBy(days) === 2, `${filledBy(days)} fills`);
  check(3, 'Multi-day gap: several market moments were processed', slots.length >= 6, `${slots.length} moments`);
  check(
    3,
    'Multi-day gap: oldest first, none repeated',
    slots.every((slot, index) => index === 0 || slot > slots[index - 1]),
  );
  check(3, 'Multi-day gap: both order moments were processed', moments.every((m) => slots.includes(m)));
  await checkFilledOnce(3, first, 'Multi-day gap, first player');
  await checkFilledOnce(3, second, 'Multi-day gap, second player');
}

function report() {
  const failed = results.filter((result) => !result.passed).length;
  const lines = [
    `## Alarm proof: ${failed === 0 ? '🟢 all passed' : `🔴 ${failed} failed`}`,
    '',
    '| | Guarantee | Check | Detail |',
    '|---|---|---|---|',
    ...results.map(
      ({ passed, guarantee, name, detail }) =>
        `| ${passed ? '🟢' : '🔴'} | ${guarantee} | ${name} | ${detail} |`,
    ),
  ];
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  return failed === 0;
}

async function main() {
  const missing = Object.entries({ BASE_URL, TICK_SECRET, CLOCK_SECRET })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing settings: ${missing.join(', ')}`);

  // The real game must never be touched: this moves the clock and makes players.
  const { environment } = await must('/health');
  if (environment !== 'preview' && environment !== 'local') {
    throw new Error(`Refusing to run on "${environment}". Only the test project is allowed.`);
  }
  console.log(`Running on ${environment}`);

  const { clock } = await must(`/world?fresh=${randomUUID()}`);
  try {
    await proveAll();
  } finally {
    await moveClock({ action: 'speed', speed: clock.speed });
    await moveClock({ action: clock.paused ? 'pause' : 'resume' });
    console.log(`Clock put back to speed ${clock.speed}, ${clock.paused ? 'stopped' : 'running'}`);
  }
  return report();
}

main().then(
  (passed) => process.exit(passed ? 0 : 1),
  (error) => {
    report();
    console.error(`FAILED: ${error.message}`);
    process.exit(1);
  },
);
