# Portfolio League

A weekly virtual trading game. Each player gets ₪1,000,000, buys and sells 20 Tel Aviv and US securities, and competes for a place on the weekly table.

**Play it:** https://million-game-three.vercel.app. It opens in a browser, with nothing to install.

## What I built, and why

- **The game:** sign-up, orders by shekel amount, a portfolio, a weekly table, and one world clock shared by all players.
- **Your stack:** Expo for web, TypeScript and Firebase, hosted on Vercel. It all runs on free plans, with no credit card.
- **A rules engine with no outside dependencies** (`packages/engine`). The rules are the product, and money must never be wrong, so they sit in one tested place. All money is whole numbers, and every calculation rounds down, so rounding can't create money.
- **All writes go through the server.** The browser can read only its own player and orders. It can never write to the database.
- **20 labelled bots** in five styles, so a new player sees a real table and not an empty one.
- **A first-time welcome and a Rules page,** because orders wait for market times, which can look broken to a new player.
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
| Orders filling by themselves on the live game | Working. cron-job.org knocks every minute, and a real order filled with nobody pressing anything. The GitHub backup is unreliable: its 15-minute timer ran by itself only once in about 10 hours, so I don't count on it. Runs by hand work, and a late knock catches up on everything missed |
| Cold start with real prices | Measured on 2026-11-09 on my Mac: a new server needs about 3.7 seconds to rebuild prices from the start of the world, 23 game weeks in (about 0.16 seconds per game week). A server that's already running answers in about 0.3 seconds, and the minute alarm keeps one running. So mostly the first players after a deploy or in a burst wait. It grows by about 0.16 seconds per real day at 7×. The fix, if it gets too slow, is to save prices at the end of each game week and rebuild only from there |
| Thousands of players at once | Not load tested |
| Divisions on the live game | Working. Game weeks have closed on live since it shipped: players are spread over all four divisions, and the table shows who's moving up and down |

## How I built the world

The world is **generated, not real data**.

- **20 fictional securities:** 10 in Tel Aviv and 10 in the US, including index funds. Showing invented prices next to real company names would mislead, so the names are made up.
- **Prices move in 5 game-minute steps,** the same for everyone, and only while their market is open. Each move combines the market (about 50% of the variance), the sector (20%) and the security itself (30%), so stocks fall together, as they do in real markets.
- **Risk feels real.** Riskier securities move more, markets can open away from the last close, and stocks get rare news jumps. So an order placed while the market is closed carries overnight risk.
- **The dollar moves** only while a market is trading, and tends to rise when Tel Aviv falls. It stays frozen over the weekend.
- **The future stays secret, even in a public repo.** Prices come from HMAC-SHA256 noise keyed by `WORLD_SEED`, which only the server has. Past prices can't reveal the seed, and the server only computes up to the world clock.
- **Long charts use simulated history.** Each security has ten years of made-up daily prices, walked backward from its start price so the line joins the game with no jump. They only feed charts and are labelled as simulated: no order, score or game price reads them.
- **Company profiles are fiction too,** and each page says so. They hold no figures or company history.
- **The news strip is real, and separate from the game.** It shows live BBC Business headlines, labelled "Real world" with their source. They never affect prices. The server reads the feed at most every 10 minutes, and the strip hides itself if the feed is down.
- **History can't drift.** A test pins the first week's exact prices, so changing the generator fails on purpose.

Why not real prices? A real feed would tie the game to market hours and to a paid or rate-limited service. It would also let anyone look up what's coming when the clock is behind real time. A generated world can be moved forward freely and costs nothing.

## How to advance the clock

The clock runs by itself at 7× speed, so one game week passes in about one real day.

1. Open the live link, go to **League**, and press **World clock** at the bottom. It's also at `/admin`. Without an account, press **Look around first** on the sign-up page to get there.
2. Enter the clock code. **I'll send it to you by email.** It's never in the repo.
3. Press **Jump to...** to go to the next market open or close. You can also stop and start time, or set the speed (real time, 7×, 30× or 60×).

Moving the clock also fills every order that became due, oldest first. A jump over several days settles each market open and close in order.

The code can move the clock and, lower on the same page, show the **Players** list: everyone who signed up, apart from the bots, with when they joined, when they last opened the game, what they hold and their place this week. It shows no emails, and it can't change players or orders. The server checks the code, and the screen keeps it in memory only. Anyone can see the World clock link, but it does nothing without the code.

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

## Playing with friends

- **Profiles** show a player's division, this week's place and score, and what they've achieved: weeks played, wins, top 3 finishes, best place and best score. These are counted from the finished weeks, so nothing extra is stored.
- **Groups** work like a clan: one group per player, up to 20 members, joined with an invite code, with a ranking of the members and a chat.
- **Results only.** Profiles and groups never show what someone holds, so nobody can copy a rival's portfolio.
- **The chat stays cheap.** A group's latest 50 messages sit in one document, so reading the chat costs one read. It refreshes every 8 seconds, and only while the screen is open.
- **Photos are small.** The player drags and zooms their picture in a round frame, and the app cuts a 160×160 JPEG of a few kilobytes from it. That goes in its own document, so it costs no paid storage and the reads that happen all the time don't carry it. A larger copy and the framing sit in another document that only its owner opens, to adjust it later. The chat fetches photos once when it opens, not on every refresh.
- **The chat looks like WhatsApp.** Your messages sit on the right, with your photo. Each friend sits on the left with their own color, given in the order they joined, so no two share one.
- **The portfolio chart is rebuilt** from a player's fills and the game's prices, so it adds no database writes.

## Coming back every day

- **Daily streak.** Opening the game counts a day, on Israel's calendar. Days in a row grow the streak, and a missed day starts it again, while the best one is kept. It's one small write a day per player.
- **Tip of the day.** When something in your own portfolio is worth knowing, the tip is about it: one security above 15%, one sector above 40%, everything in dollars or everything in Tel Aviv, or a lot of cash. Otherwise it's a general lesson. It's worked out in the app, so it costs nothing on the server.
- **Look around first.** A visitor can see the market, every stock page, the league table and the rules before signing up. Buying or watching asks them to join.
- **A home-screen app.** On a phone, the site can be added to the home screen with its own icon, and then opens full screen. Phones get a one-time tip showing how.
- **Badges.** 17 awards to aim for: first trade, a spread of 5 securities, both markets, first week, 4 weeks played, beat the market (every index fund), a 5% week, a steady week, moving up, reaching Silver, Gold and Diamond, top 3, a win, 3 wins, and 7 or 30 days in a row. League badges are counted from finished weeks, so they cost no extra reads. Your own page shows the ones still to earn.
- **Share my week.** Your profile can make a picture of this week's place, return and score, with a link to join. It's drawn in the browser and sent with the phone's own share menu.

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
- **Firebase custom claims for the clock.** One secret that can only move the clock and read the players list is simpler and does the same job here.
- **Cloud Functions.** The whole backend runs as a single Vercel function, so it's one host and one deploy.

## Tomorrow this goes to customers

**Built:**

| Worry | What's in place |
|---|---|
| Bursts at market open | Market data is cached at the CDN for 5 seconds and the table for 30, so a crowd mostly doesn't reach the database. Polling stops when a tab is hidden |
| Floods, scripts and guessing | Every request has a per-minute limit on the server. See [request limits](#request-limits) |
| Other developers shipping daily | `main` is protected: a PR is required, and tests, type checks, the build and emulator tests must all pass. Every PR gets a preview. A failing test and a direct push to `main` were both tried and refused |
| Double execution | A lease keeps alarm runs apart, each fill works on the latest stored player, and a retry after a crash rebuilds the same result. Division moves save in the same write as the table, so a retry can't move anyone twice |
| Missed runs | A stored cursor means a late alarm settles every missed market open and close, oldest first |
| Money bugs | 211 engine tests and 231 API tests. I also broke engine rules on purpose in a copy, to prove the tests catch it |
| Database security | Rules allow reading only your own data and deny all browser writes. They're attacked in tests on the Firebase emulator |
| Secrets | Separate dev and production Firebase projects, with separate secrets. The server refuses to start if one is missing |
| Dependencies | I reviewed all 13 `npm audit` warnings. None reaches a player or the running server. The automatic fix would downgrade Firebase and Expo, so I didn't apply it |

**Emergency brake:** the admin page can pause trading for everyone with the clock code. New orders are refused, while time, prices, fills and the table go on, and every player sees a notice.

**Watchdog:** about every 15 minutes, GitHub checks that the game is up and that orders fill on time, and emails an alert if not. See [watchdog](#watchdog).

**Undoing a bad release:** see [rolling back](#rolling-back).

**Not built yet:** error tracking (Sentry), encrypted backups (the free Firebase plan has none), a practised rollback, and a load test. Until those exist, I wouldn't go on vacation.

**Limits I know about:**

- The free Firestore plan allows 50k reads and 20k writes a day, or roughly 4,000 orders. Thousands of real players would need a paid plan.
- Fills appear up to one alarm interval late, but they always use the correct price and time.
- A player with a due order that hasn't filled yet can't place another until it does. The order window says so and opens again by itself, usually within a minute.
- The table shows the top 500 players. A player below that doesn't see their division yet.
- `saveSlot` writes everything in one transaction, which is fine up to about 20,000 players and then needs splitting.

## Rolling back

If a release breaks the live game, put the last good version back first and find the cause after.

1. **Vercel → the project → Deployments.** Find the last production deployment that worked, open its menu and choose **Instant Rollback**. It goes live within seconds, with no new build. On the free plan this goes back one release at a time.
2. **Undo the change in GitHub.** Open the bad PR and press **Revert**, then merge the revert PR once CI passes. Until then, the next merge to `main` would bring the problem back. After a rollback, Vercel still builds new merges but doesn't put them live by itself: when the revert's deployment is ready, open it and choose **Promote**.
3. **Check it worked.** Open the live link, and run the watchdog by hand (Actions → Watchdog → Run workflow, "live").

What a rollback does **not** undo:

- **Data.** Anything the bad version wrote to Firestore stays. The free plan has no backups, so a bad write must be fixed by hand or by a script.
- **Firestore rules.** They're published by hand in the Firebase console, not deployed with the code. Republish the previous `firestore.rules` from Git.
- **Secrets.** Vercel settings aren't part of a deployment. A wrong or missing secret has to be fixed in Vercel, then redeployed.

To stop trading while you work it out, use the emergency brake on the admin page. Never change `WORLD_SEED` on the live project: it would change every price.

This hasn't been practised on the live game, because a practice would take it back a version for a minute.

## Request limits

Every request to the server falls into one category, and each category allows a number of requests a minute. They're counted twice: per network address, and per signed-in player.

| Category | What's in it | Per player | Per address |
|---|---|---|---|
| Read | Prices, charts, security pages, the table, profiles, your player, the chat. Mostly served by the CDN, 0 to 2 database reads each | 120 | 1,500 |
| Costly read | Your order list (up to 50 database reads) and portfolio history (reads every order you have) | 20 | 150 |
| Write | Orders, watchlist, goal, photo, groups, chat messages | 30 | 300 |
| Sign-up | Creating a player | 5 | 10 |
| Secret | The clock code and the alarm | none | 10 |

- **Shared connections are fine.** An office address allows about 15 busy players at once. A test runs five colleagues chatting and browsing from one address for five minutes.
- **Over the limit:** the server answers `429` with a `Retry-After` header and a message saying how many seconds to wait. Reads and writes are counted apart, so browsing never blocks an order.
- **The limits come from what the app really sends.** An open app sends about 35 requests a minute, or about 45 with the group chat open, plus 1 to 3 for each security opened. It asks for the order list about once a minute, and the portfolio history when you open it or change its range.
- **Normal play never gets near them.** Tests play a busy session, a busy minute on the portfolio screen (every chart range, five orders, the refreshes after fills), and five colleagues on one address. None is limited. A test plays ten busy minutes with the real limits (every poll, every security page opened twice a minute, and orders) and is never limited.
- **Search costs nothing.** It filters the list the app already has, in the browser, so it sends no requests and needs no category.
- **The client can't skip it.** It runs on the server before every route. The player count uses the verified sign-in token, so made-up tokens don't help. The address comes from headers Vercel sets itself.
- **The clock code can't be guessed.** Ten wrong tries a minute, then even the right code waits. Right codes never count, so the alarm is never slowed.
- **Sign-in itself isn't ours to limit.** Email and password go straight from the browser to Firebase Auth, which has its own protection against repeated tries.
- **Honest limit:** counts live in the server's memory. Vercel can run a few copies at once and each counts on its own, so the real ceiling is a few times higher, and a restart clears the counts. That's enough to stop floods and needs no extra service. A shared counter (for example Redis) would be the next step.

**Fewer database reads.**

- **The order list:** each order in it costs one read, up to 50. The app used to fetch it every 15 seconds. Now it fetches it only when your cash, holdings or waiting orders changed, or once a minute as a safety net. For a player with 50 orders, an open app goes from about 210 reads a minute to about 60.
- **Portfolio history:** it reads every order you have. The server now remembers each player's list and reuses it until the player changes (a new order or a fill), so switching between the eight chart ranges costs 2 reads each instead of hundreds. It keeps up to 200 players' lists in memory, and a test checks the list is read again after a new order.

**The daily quota is still a risk.** The free plan allows 50,000 reads a day for the whole game, and the limits above are per minute.

- **One abuser** with an account can still spend about 1,000 reads a minute on the order list (20 requests × 50 orders), which empties the day's reads in under an hour. Before the costly category, it was about 15,000 a minute.
- **Many accounts** on one address share 150 costly requests a minute, so opening more accounts doesn't multiply the damage. Many addresses would.
- **Real growth** hits the same wall. At about 60 reads a minute, a few hundred player-hours a day is enough to reach 50,000.
- **What would fix it:** a daily allowance per player kept in the database, an alert at 80% of the quota, and the paid Blaze plan, where the quota becomes a bill instead of an outage. Firebase has no hard spending cap, so that needs a budget alert too. I left these out because they need a credit card or another stored counter, and the brief asks for neither.

## Watchdog

A GitHub job, [`watchdog.yml`](.github/workflows/watchdog.yml), runs [`scripts/watchdog.mjs`](scripts/watchdog.mjs) about every 15 minutes against the live game. It's free and needs no outside service.

**What it checks.** It only reads: every request is a GET, so it can't place orders, move money or touch the clock.

| Check | Fails when |
|---|---|
| Website loads | The home page doesn't answer 200, or isn't the game |
| Server answers | `/api/health` doesn't say ok |
| Database answers | `/api/world` fails, so Firestore is down or out of free quota |
| Orders fill on time | `/api/status` says a market open or close passed more than 10 real minutes ago without being worked through, or an order has been due for more than 10 minutes and is still waiting, or the answer is more than 5 minutes old |

`/api/status` is cached for 60 seconds and reads at most 3 documents, so checking it costs almost nothing. A paused clock is never "late", because time isn't moving.

**How alerts work.** A check counts as failed only after 3 tries, 20 seconds apart, so one slow answer doesn't wake anyone. Then the job opens one GitHub issue labelled `watchdog`, and GitHub emails it. The issue says what failed, when (Israel time and UTC), and links to the run. While the same failure goes on, nothing more is sent. If a different check starts failing, the issue is updated and you get one email. When everything passes again, the issue is closed with a note, which is one last email.

**How to run it by hand.** In GitHub: Actions → Watchdog → Run workflow. Choose "live" or "this branch's preview". Alerts are off for button runs unless you tick them, so testing doesn't send email.

**Getting the email.** The alert mentions @NOhana1, so GitHub emails the owner even when not watching the repo. Check GitHub → Settings → Notifications → "Participating, @mentions and custom" has Email on, and look in spam for the first one. Alerts are GitHub issues with the `watchdog` label: [all alerts](https://github.com/NOhana1/Million-Game/issues?q=label%3Awatchdog).

**Closing alerts.** Don't close an alert by hand while the problem is still there: the next run opens a new one and emails again. Fix the problem and let the next run close it. Close one by hand only if it came from a test, so the live watchdog doesn't later "recover" from it.

**Testing the alert.** A button run with alerts ticked against a preview opens a real issue and a real email. Previews use the test project, which has no every-minute alarm, so "Orders fill on time" fails there on purpose. Tested this way on 2026-11-08 ([#13](https://github.com/NOhana1/Million-Game/issues/13)): the first run opened one alert, the second sent nothing new, then the test alert was closed by hand. The button only exists once the workflow is on `main`.

**The pieces.**

| File | Job |
|---|---|
| [`apps/api/src/routes/status.ts`](apps/api/src/routes/status.ts) | `GET /api/status`: how far behind order filling is. Read-only |
| [`scripts/watchdog.mjs`](scripts/watchdog.mjs) | The checks, the retries and the alert issue |
| [`scripts/watchdog.test.mjs`](scripts/watchdog.test.mjs) | Tests for when to open, update, close or stay quiet. Run in CI |
| [`.github/workflows/watchdog.yml`](.github/workflows/watchdog.yml) | The timer (minutes 3, 18, 33, 48) and the button |

To run it from a terminal (report only, never alerts without `SEND_ALERT=true`): `node scripts/watchdog.mjs`. Add `SITE_URL=<preview url>` and `VERCEL_BYPASS=<the bypass secret>` to check a preview.

**Limits.**

- GitHub's timer is best effort. In this repo the backup alarm's 15-minute timer has run far less often than asked, so a problem may be noticed 15 minutes to a few hours late. For a steadier timer, cron-job.org (which already knocks the alarm) can start this workflow through GitHub's API. That needs a GitHub token kept in cron-job.org, which only the owner should set up.
- GitHub turns off timers in a repo with no activity for 60 days.
- It sees what any visitor sees. It doesn't catch wrong prices, a wrong score, or an error only some players hit. That's what error tracking (Sentry) would add.
- It checks the live game only on its timer. Previews are checked only by the button.
- If GitHub itself is down, nothing is checked.

**When an alert comes:**

| Failed check | First things to look at |
|---|---|
| Website loads | Vercel dashboard → Deployments: is the latest one ready? Roll back to the last good one if not |
| Server answers | Vercel → the project's Logs for errors. A missing secret stops the server at start |
| Database answers | Firebase console → Usage. The free plan stops at 50k reads or 20k writes a day and resets at midnight Pacific time |
| Orders fill on time | cron-job.org: is the job still on, and does it get 200? Then run the Backup alarm workflow by hand, which catches up everything missed. If trading must stop meanwhile, use the emergency brake on the admin page |

Every check passing again closes the issue by itself.

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
