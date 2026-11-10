# API contract

What the app can rely on. All paths start with `/api`, on the same address as the site.

## Conventions

- **Money is whole numbers, as in the engine.** Agorot for shekels, 1/10,000 for prices and the dollar rate, 1/1,000,000 for units.
- **Times are milliseconds since 1970.** World times are named `world...`, and only the server decides them.
- **Signed-in calls** send `Authorization: Bearer <Firebase ID token>`.
- **Errors** look like `{ "error": { "code": "POSITION_LIMIT", "message": "..." } }`. Use `code` in logic. `message` is for developers.

## Routes

| Method and path | Sign-in | Cached | Purpose |
|---|---|---|---|
| `GET /health` | No | No | Is the API up, and which version |
| `GET /status` | No | 60s | For the watchdog: the clock, how far fills have got (`settledUpTo`) and `fills: {late, slotLateSeconds, overdueOrders}`. Reads only |
| `POST /players` | Yes | No | Create the player. Body `{ "name": "Noa" }`, 2 to 24 characters. Returns 201, or 200 with the existing player, who is never reset. 403 `EMAIL_NOT_CONFIRMED` until the account's email is confirmed. 409 `NAME_TAKEN` if another player has the name, ignoring capitals and spaces, or it's a bot's name |
| `POST /accounts/release` | No | No | Body `{ "email": "a@b.com" }`. When sign-up finds the email taken: deletes its account only if it never confirmed the email, has no player, and is over 15 minutes old. Returns `{ "freed": true }`, or `false` with `reason` `none`, `in-use` or `recent`. Counts as sign-up for request limits |
| `GET /players/name?name=Noa` | No | No | Whether a name is free, before an account exists. Returns `{ "available": true, "problem": null }`, or `false` with a message to show |
| `GET /me` | Yes | No | The player's portfolio. 404 `PLAYER_NOT_FOUND` means call `POST /players` first |
| `GET /world` | No | 5s | World time, the clock's `speed` and `paused`, and for each market whether it's open and when that next changes |
| `GET /market` | No | 5s | All securities with `price`, `priceDayAgo`, `usdIls` and `usdIlsDayAgo` |
| `GET /market/:id/history` | No | 60s | Chart points for the last 5 world days, ending at the current price. With `?range=` (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `5Y`, `ALL`), the points for that chart button, and `gameStartedAt`: prices before it are simulated history |
| `GET /news` | No | 300s | Real business headlines for the moving strip: `source` and `headlines` (`title`, `link`). Empty if the feed is down |
| `GET /market/sparks` | No | 120s | A short line of the last 7 world days for every security, by id |

`GET /me` also returns `worldTime`, `reserved` (cash held for pending buys), `value` (whole portfolio), `positions`, and `goal` once the player has set one.

| Method and path | Sign-in | Cached | Purpose |
|---|---|---|---|
| `GET /me/history` | Yes | Private, 30s | The player's value over time, rebuilt from their fills. Optional `?range=` as for market history. Points use `price` for the value in agorot, so charts share one shape |
| `POST /me/visit` | Yes | No | Counts today's visit toward the daily streak, on Israel's calendar. Returns `{ "streak": { "days", "best", "lastDay" } }`. Only the first call of a day changes it. `GET /me` returns it as `streak` |
| `PUT /me/watchlist` | Yes | No | Saves the security ids the player watches. Body `{ "ids": ["TAIX"] }`, up to 20. `GET /me` returns them as `watchlist` |
| `GET /players/:id/profile` | No | 30s | A player's results: `division`, `thisWeek` (or null) and `honours` counted from finished weeks (weeks played, wins, top 3, best place and score, weeks that beat every index fund, moves up a division, 5% weeks, steady weeks, highest division). Never their holdings |
| `GET /group` | Yes | No | The player's group with each member's results this week, best first, or `{ "group": null }`. Never holdings |
| `POST /groups` | Yes | No | Starts a group. Body `{ "name": "The Bulls" }`, 3 to 30 characters. A player is in one group at most |
| `POST /groups/join` | Yes | No | Joins with an invite code. Body `{ "code": "R3H2CD" }`. Groups hold up to 20 |
| `POST /group/leave` | Yes | No | Leaves. The next member takes over from an owner, and the last one out deletes the group |
| `DELETE /group/members/:id` | Yes | No | The owner removes a member |
| `POST /group/code` | Yes | No | The owner swaps the invite code. The old one stops working, members stay. Returns `{ code }` |
| `PUT /me/photo` | Yes | No | Saves a profile photo. Body `{ "photo": "data:image/jpeg;base64,…", "original": "data:image/jpeg;base64,…", "crop": { "zoom": 1.5, "x": 0.1, "y": 0 } }`. `photo` is the 160×160 JPEG everyone sees, up to 60,000 characters. `original` is the larger picture it was cut from, up to 300,000, kept with `crop` so the player can adjust it later |
| `GET /me/photo` | Yes | No | `{ "saved": { "original", "crop" } }`, or `{ "saved": null }`. Only for the photo's owner |
| `DELETE /me/photo` | Yes | No | Removes the profile photo |
| `GET /group/photos` | Yes | No | `{ "photos": { "<id>": "data:…" } }` for the members who have one. The chat fetches it once when it opens |
| `GET /group/chat` | Yes | No | The group's latest 50 messages, oldest first. Only for its members |
| `POST /group/chat` | Yes | No | Sends a message. Body `{ "text": "hello" }`, up to 300 characters, at most one every 1.5 seconds |
| `PUT /me/name` | Yes | No | Renames the player. Body `{ "name": "Noa" }`, 2–24 characters, checked like a new player's name. The old name is freed; the group and table show the new one at once, the league after the next market open or close. Returns `{ "name" }`. 409 `NAME_TAKEN` if someone holds it or it's a bot's; 404 `PLAYER_NOT_FOUND` |
| `PUT /me/goal` | Yes | No | Sets the player's long-term goal. Body `{ "amount": 200000000 }` in agorot, up to ₪1,000,000,000. Returns `{ "goal": 200000000 }`. 404 `PLAYER_NOT_FOUND` means call `POST /players` first |

## Orders

| Method and path | Sign-in | Cached | Purpose |
|---|---|---|---|
| `POST /orders` | Yes | No | Body `{ "id": "<new UUID>", "securityId": "TAIX", "side": "buy", "amount": 100000 }`, with `amount` in agorot, at least ₪100. A sell can send `"amount": "all"` to sell the whole holding. Returns 201 with the order |
| `GET /me/orders` | Yes | No | Order history, newest first. Optional `?limit=` (up to 50) and `?after=<next>`. Returns `{ orders, next }`, and `next` is null on the last page |

- **Make the UUID once per order, not once per request.** Send the same id on any retry: the server then returns the original order with status 200 and charges nothing.
- **There is no cancel route, on purpose** (Rule 3).

| Error code | Status | Meaning |
|---|---|---|
| `INSUFFICIENT_CASH` | 422 | Not enough available cash |
| `POSITION_LIMIT` | 422 | More than 20% in one security |
| `BELOW_MINIMUM` | 422 | Under ₪100 |
| `INSUFFICIENT_HOLDING` | 422 | Selling more than is held |
| `TOO_MANY_PENDING` | 409 | Already 50 orders waiting |
| `ORDER_SETTLING` | 409 | An earlier order is due and filling. Retry shortly |
| `UNKNOWN_SECURITY` | 404 | No such security |
| `PLAYER_NOT_FOUND` | 404 | Call `POST /players` first |
| `EMAIL_NOT_CONFIRMED` | 403 | Click the link Firebase emailed, then call `POST /players` again |
| `NAME_TAKEN` | 409 | Choose another name |
| `INVALID_BODY` | 400 | The request is malformed |
| `UNAUTHENTICATED` | 401 | Sign in again |

## League

| Method and path | Sign-in | Cached | Purpose |
|---|---|---|---|
| `GET /league` | No | 30s | This week's table, updated at each market open and close |
| `GET /league/weeks/:endsAt` | No | 5min | A finished week's final table. 404 `UNKNOWN_WEEK` if there's none |

Both return `{ updatedAt, weekEndsAt, previousWeekEndsAt, total, rows, indexes }`. Before the first market event, `rows` is empty and the times are null.

Each row is `{ rank, id, name, bot, value, returnPpm, maxFallPpm, returnRank, stabilityRank, score, division }`.

- **`division`** is `bronze`, `silver`, `gold` or `diamond`: the division the player competes in that week.
- **`nextDivision`** appears on finished weeks only: where that week's result moved them.
- **`indexes`** maps each index fund's id to its return this week, in shekels, in parts per million. It's empty before the first market event.

- **Is the signed-in player on the table?** Compare `id` with their Firebase user id.
- **Rows stop at 500.** `total` is the full count.
- **Only players who held a security that week appear.** A player who has stayed in cash won't be listed.
- **To show last week,** use `previousWeekEndsAt` with `/league/weeks/:endsAt`.

## Filled orders

- `GET /me/orders` includes both pending and filled orders. Filled ones have `status: "filled"` and a `fill` object: `units`, `price`, `fx`, `value`, `refund` and `at`.
- `GET /me` lists only pending orders in `pendingOrders`.
- `refund` is the part of a buy returned to cash because of the 20% limit at fill. A buy can fill for less than requested, or for 0 units.
- A sale can return less than requested, or fill for 0 units.
- Fills appear shortly after their moment, not exactly on it, because a cron runs them about once a minute. `fill.at` is always the true execution time.

## Running locally

`npm run dev --workspace @portfolio-league/api` starts the API on port 8787. Without a `.env` file it uses memory, the token is simply the user id, and orders fill by themselves every 5 seconds.

| Method and path | Purpose |
|---|---|
| `POST /dev/advance` | **Local only.** Jumps to the next market open or close and fills orders. Body `{ "to": <world ms> }` jumps to a chosen time, forward only |

## System

| Method and path | Sign-in | Purpose |
|---|---|---|
| `POST /tick` | `Bearer <TICK_SECRET>` | Fills due orders. Called by the cron, never by the app. Returns `{ status, cursor, filled, failed, slots }`, where `slots` lists each market open and close it finished, oldest first |
| `POST /admin/clock` | `Bearer <CLOCK_SECRET>` | Moves the clock, then fills what became due. Returns `{ worldTime, clock, settlement }` |
| `POST /admin/players` | `Bearer <CLOCK_SECRET>` | Read-only. Real players and bots, kept apart, names only: `{ players, bots }`. Reads every player once |
| `POST /admin/bots` | `Bearer <CLOCK_SECRET>` | Adds one bot: random style, random division, its own picks bought at once (they fill at the next market open or close, when it joins the table). Starts the league if it hasn't started. `409 BUSY` while the league updates. Returns `201 { bot: { id, name } }` |
| `DELETE /admin/bots/:id` | `Bearer <CLOCK_SECRET>` | Removes a bot from the league and the table. Past weeks keep its results. `404 NO_BOT` if it isn't a bot; `409 BUSY` while the league updates. Returns `{ deleted: true }` |
| `DELETE /admin/players/:id` | `Bearer <CLOCK_SECRET>` | Deletes a real player: game data, group spot, photo, orders, league place and name (free for others again), then their sign-in, so the email can sign up again. Past weeks keep their results. `409 BUSY` while the league updates; `400 BOT` for a bot. Safe to repeat. Returns `{ deleted: true }` |

Bodies for `POST /admin/clock`:

| Body | Effect |
|---|---|
| `{ "action": "advance", "to": <world ms> }` | Jumps forward. A time already passed changes nothing, so a double click is safe |
| `{ "action": "advance", "to": "next" }` | Jumps to the next market open or close. Each call moves on again |
| `{ "action": "pause" }`, `{ "action": "resume" }` | Stops or restarts time |
| `{ "action": "speed", "speed": 7 }` | World time per real time, from 1 to 60 |
| `{ "action": "trading", "open": false }` | The emergency brake. New orders get `503 TRADING_PAUSED`, while time, prices, fills and the table go on. `"open": true` lifts it. `GET /world` shows it as `clock.tradingPaused` |
