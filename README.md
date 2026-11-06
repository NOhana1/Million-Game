# Portfolio League

A weekly virtual trading game. Each player gets ₪1,000,000, buys and sells 20 Tel Aviv and US securities, and competes for a place on the weekly table.

**Play it:** https://million-game-three.vercel.app. It opens in a browser, with nothing to install.

## What I built, and why

- **The game:** sign-up, orders by shekel amount, a portfolio, a weekly table, and one world clock shared by all players.
- **Your stack:** Expo for web, TypeScript and Firebase, hosted on Vercel. It all runs on free plans, with no credit card.
- **A rules engine with no outside dependencies** (`packages/engine`). The rules are the product, and money must never be wrong, so they sit in one tested place. All money is whole numbers, and every calculation rounds down, so rounding can't create money.
- **All writes go through the server.** The browser can read only its own player and orders. It can never write to the database.
- **20 labelled bots** in five styles, so a new player sees a real table and not an empty one.
- **Divisions, a personal goal, a market comparison and a weekly top 3,** so there's a reason to come back. See [the daily feature](#the-daily-feature-divisions).

```
Browser ──► Vercel static site (Expo web export)
   │  sign-in
   ├──────► Firebase Auth
   │  /api/* with a Firebase ID token
   └──────► Vercel Function (apps/api) ──► Firestore
Alarm ── POST /api/tick (secret) ──► same function
```

## Not proven yet

| What | State |
|---|---|
| **Orders filling by themselves on the live game** | Not until the alarm is connected. Until then, orders fill only when someone uses the World clock screen, and the table stays empty until the first fill round |
| Cold start with real prices | Not measured. Prices rebuild from the start of the world, about 0.2 seconds per game week on my Mac, so it grows with game time |
| Thousands of players at once | Not load tested |
| Divisions on the live game | Tested with automated tests and in a browser on a local server. They only move on live once weeks close, which needs the alarm |

## How I built the world

The world is **generated, not real data**.

- **20 fictional securities:** 10 in Tel Aviv and 10 in the US, including index funds. Showing invented prices next to real company names would mislead, so the names are made up.
- **Prices move in 5 game-minute steps,** the same for everyone, and only while their market is open. Each move combines the market (about 50% of the variance), the sector (20%) and the security itself (30%), so stocks fall together, as they do in real markets.
- **Risk feels real.** Riskier securities move more, markets can open away from the last close, and stocks get rare news jumps. So an order placed while the market is closed carries overnight risk.
- **The dollar moves** only while a market is trading, and tends to rise when Tel Aviv falls. It stays frozen over the weekend.
- **The future stays secret, even in a public repo.** Prices come from HMAC-SHA256 noise keyed by `WORLD_SEED`, which only the server has. Past prices can't reveal the seed, and the server only computes up to the world clock.
- **History can't drift.** A test pins the first week's exact prices, so changing the generator fails on purpose.

Why not real prices? A real feed would tie the game to market hours and to a paid or rate-limited service. It would also let anyone look up what's coming when the clock is behind real time. A generated world can be moved forward freely and costs nothing.

## How to advance the clock

The clock runs by itself at 7× speed, so one game week passes in about one real day.

1. Open the live link, go to **League**, and press **World clock** at the bottom. It's also at `/admin`.
2. Enter the clock code. **I'll send it to you by email.** It's never in the repo.
3. Press **Jump to...** to go to the next market open or close. You can also stop and start time, or set the speed (real time, 7×, 30× or 60×).

Moving the clock also fills every order that became due, oldest first. A jump over several days settles each market open and close in order.

The code can only move the clock. It can't touch players or orders. The server checks it, and the screen keeps it in memory only. Anyone can see the World clock link, but it does nothing without the code.

## The daily feature: Divisions

Every player starts in **Bronze** and can climb to **Silver, Gold and Diamond**. When a week ends, the top 25% of each division move up and the bottom 25% move down. The League screen shows who's on course to move, with a countdown to the end of the week.

**Why this one.** A player who has bought their stocks has nothing to do, and nothing to lose by staying away. And a weekly table has a second problem: most players know by midweek that they've lost.

Divisions fix both, because of how the game clock runs. At normal speed, one game week takes one real day. So every real day ends with a result that lasts: you moved up, you held on, or you dropped. If today went badly, tomorrow is a fresh start. It also works for a single player, because the bots fill the division, and it rewards a good result, not trading more.

**Three smaller features support it:**

| Feature | What it does | Why |
|---|---|---|
| **Personal goal** | You choose a target for your portfolio, and a progress bar stays on the Market screen | Divisions give a daily reason to return. This gives a long-term one |
| **You vs the market** | Your last day and this week, next to the three index funds, all in shekels | Beating the market is the honest measure of how you're doing, and it teaches how hard that is |
| **Last week's top 3** | The winners and their returns, on the League screen | Gives everyone something to aim for. What they held stays private |

The Daily Recap stays too, as the first thing on the Market screen: your last day, your best and worst holdings, and your fills.

**Honest limits.** I found no number that shows how much leagues help on their own, so this is a judgement, not a proven result. Because return carries 85% of the score, Divisions also reward big bets, as the table already does. And a web link has no push notifications, so nothing reminds a player to come back.

**How I'd know it works.** Nothing is measured yet. The plan:

- Hide Divisions from a random 10% of players, as a control group.
- **Main measure:** the share of players who come back the next real day, compared with the control group.
- **Supporting measures:** days active per week, and how many players are still active after two weeks.
- **Guardrails:** orders per player, and the share of portfolios in the riskiest securities. If Divisions work only by making people trade more or gamble more, that's not the win I want.
- Run it for at least two real weeks before deciding. If the return rate doesn't beat the control group, I'd replace the feature.

## Rules I completed

The main decisions are below. All of them, with code references, are in [`packages/engine/RULES.md`](packages/engine/RULES.md).

| Rule | My decision | Why |
|---|---|---|
| Cash for pending buys | Taken when the order is sent | Otherwise pending buys could exceed cash, which is leverage |
| Portfolio value | Includes cash held for pending buys | That money still belongs to the player |
| Funding a buy from a pending sale | Not allowed | The cash doesn't exist until the sale fills |
| Order exactly at open or close | Open counts as in session, close counts as closed | The brief doesn't cover the boundary |
| Order before the open on a trading day | Fills at that day's open | It's what a player expects from "next trading day" |
| Orders due at the same moment | Fill in the order they were sent | Simple and fair |
| Double tap | The same order id is charged once | A retry must never charge twice |
| Minimum order and fees | ₪100 minimum, except selling everything. No fees | The brief sets neither, and a small remainder can always be cleared |
| Pending orders | Up to 50 per player | Protects the server. The brief sets no limit |
| Sale larger than the holding | Capped at the units held, so it can return less | The price may fall after sending, and shorting must stay impossible |
| Sale with nothing left | Recorded as filled with 0 units | Orders can't be cancelled, so it needs a final state |
| "Sell everything" | Sells every unit held at fill. One per security can be pending | Selling by amount can leave a small remainder |
| When the 20% limit applies | When sent, and again at fill, using execution prices | The fill is the real moment of purchase, but players should hear early |
| What the 20% is measured against | The whole portfolio at last known prices, including closed markets | The brief doesn't define it |
| What counts toward the 20% | Holdings and pending buys of that security | Several orders can't slip past the limit one by one |
| Buy that breaks 20% at fill | Fills up to the limit, and returns the rest of the cash | The player can't react, because orders can't be cancelled |
| Holding that grows past 20% | Allowed, but adding to it is blocked | The rule applies at purchase |
| Dollar balance | None. US sales convert straight to shekels at the rate at execution | Rule 5 only covers buying, and one currency keeps the portfolio simple |
| Dollar rate at the weekend | The last known rate applies until Monday | No market is open |
| Percentile | The share of other players ranked below you. Ties share the average, and a lone player gets 100 | The brief gives no formula, and it divides by zero otherwise |
| Score ties | Higher return, then smaller drawdown, then player id | The order must always be the same |
| When the week ends | At the Friday US close. Weekend gaps count for the new week | Tel Aviv closes hours earlier, and the week should include all trading |
| Weekly reset | The portfolio carries over. Only the score resets | The brief describes no reset |
| Drawdown | Measured on every 5-minute price step, the same for all players | Gives it one fixed definition, and catches falls during the day |
| Who appears on the table | Only players who held a security that week | Stops abandoned accounts from scoring well |
| Joining mid-week | Counts from when you joined | Your return is measured from your own start value |
| Holidays | None | The world is generated |
| Trading hours | Set in each market's own time zone | The gap between Israel and New York changes during the year |
| Division moves | The score stays the one from the brief, across all players. Moves depend only on your place among players in your own division | The brief's scoring stays untouched, and each division still feels like its own contest |
| Small divisions | The top quarter rounds up and the bottom quarter rounds down, so a division of 1 to 3 still sends one player up, and nobody down | Nobody gets stuck because a division is nearly empty |
| Who moves | Only players on the table. Someone who held nothing that week stays where they are | Sitting in cash shouldn't move you in either direction |

## Rules I think are bad or exploitable

| Rule | Problem | What I'd suggest |
|---|---|---|
| **Stability rewards cash** | All cash has a drawdown of 0, so it's a free 100 on stability. My table rule removes players who held nothing all week, but "gain on Monday, sell, sit in cash" still works | Score stability only for time spent invested |
| **85% on one week's return rank** | Rank rewards the extreme, so the best strategy is a concentrated gamble. That's an odd lesson for a financial education product | Lower the weight, or score over several weeks |
| **Free sign-ups** | Open many accounts, make a wild bet in each, keep the winner. Email isn't verified today, so this works in the game now | Require a verified email at minimum |
| **The 20% limit is per security** | Several stocks in one sector are almost one bet, and they pass the limit | Add a limit per sector |
| **No fees** | Churn is free | Add a small fee |

## What I gave up, and why

- **Real market data:** see the world section above.
- **Showing what winners hold.** It would teach more, but it would make players' portfolios public, so the top 3 shows results only.
- **Real S&P 500 and Nasdaq numbers.** The game's prices are invented, so a real index would mean nothing next to them. The comparison uses the game's own index funds.
- **Native apps.** The brief asks for a browser link, so only web has been tested. Some code assumes the browser.
- **Hebrew and right-to-left layout.** The app is in English. The required work came first.
- **Firebase custom claims for the clock.** One secret that can only move the clock is simpler and does the same job here.
- **Cloud Functions.** The whole backend runs as a single Vercel function, so it's one host and one deploy.

## Tomorrow this goes to customers

**Built:**

| Worry | What's in place |
|---|---|
| Bursts at market open | Market data is cached at the CDN for 5 seconds and the table for 30, so a crowd mostly doesn't reach the database. Polling stops when a tab is hidden |
| Other developers shipping daily | `main` is protected: a PR is required, and tests, type checks, the build and emulator tests must all pass. Every PR gets a preview. A failing test and a direct push to `main` were both tried and refused |
| Double execution | A lease keeps alarm runs apart, each fill works on the latest stored player, and a retry after a crash rebuilds the same result. Division moves save in the same write as the table, so a retry can't move anyone twice |
| Missed runs | A stored cursor means a late alarm settles every missed market open and close, oldest first |
| Money bugs | 189 engine tests and 139 API tests. I also broke engine rules on purpose in a copy, to prove the tests catch it |
| Database security | Rules allow reading only your own data and deny all browser writes. They're attacked in tests on the Firebase emulator |
| Secrets | Separate dev and production Firebase projects, with separate secrets. The server refuses to start if one is missing |
| Dependencies | I reviewed all 13 `npm audit` warnings. None reaches a player or the running server. The automatic fix would downgrade Firebase and Expo, so I didn't apply it |

**Not built yet:** kill switch, rate limits, error tracking (Sentry), uptime alerts, encrypted backups (the free Firebase plan has none), a rollback drill, and a load test. Until those exist, I wouldn't go on vacation.

**Limits I know about:**

- The free Firestore plan allows 50k reads and 20k writes a day, or roughly 4,000 orders. Thousands of real players would need a paid plan.
- Fills appear up to one alarm interval late, but they always use the correct price and time.
- A player with a due order that hasn't filled yet can't place another until it does.
- The table shows the top 500 players. A player below that doesn't see their division yet.
- `saveSlot` writes everything in one transaction, which is fine up to about 20,000 players and then needs splitting.

## Running it locally

Needs Node 22 or newer. With no `.env`, the API runs in memory and orders fill every 5 seconds.

```bash
npm ci
```

```bash
WORLD_SEED=local-development-seed-not-a-secret npm run dev --workspace @portfolio-league/api
```

```bash
npm run web
```

Tests:

```bash
npm test --workspace @portfolio-league/engine
```

```bash
npm test --workspace @portfolio-league/api
```

More detail: [every route](apps/api/CONTRACT.md), [connecting Firebase](apps/api/CONNECT.md), [every rule](packages/engine/RULES.md).
