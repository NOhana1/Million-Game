# Game rules

What the engine does, and where each behaviour comes from. **Brief** means the task states it.
**Assumption** means we chose it because the brief is silent or unclear, so it can be challenged.

Run the tests with `npm test` from the repo root.

## Rules from the brief

| Rule | Brief | Status | Code |
|---|---|---|---|
| R1 | Start with ₪1,000,000 cash | Done | `orders.ts` |
| R2 | Trade by shekel amount, fractional units allowed | Done | `orders.ts`, `money.ts` |
| R3 | In session: fill at that day's close. Closed: fill at the next trading day's open | Done | `calendar.ts` |
| R3 | Orders can't be cancelled | Done: no cancel function exists | `orders.ts` |
| R4 | No short selling, no leverage | Done | `orders.ts` |
| R4 | One security can't exceed 20% at the moment of purchase | Done: checked at submission and again at fill | `orders.ts` |
| R5 | US securities convert at the dollar rate at execution | Done: the caller supplies the rate at execution | `orders.ts` |
| R6 | Score = 0.85 × return rank + 0.15 × stability rank, weekly | Done | `score.ts`, `week.ts` |
| Hours | Tel Aviv Mon-Thu 10:00-17:30, Fri 10:00-13:50. US 9:30-16:00 | Done, in each market's own time zone | `calendar.ts` |

## Assumptions

### Money

| # | Assumption | Why |
|---|---|---|
| A1 | Cash is whole agorot, prices and the dollar rate have 4 decimals, units have 6 decimals | Whole numbers give the same result on every device |
| A2 | Every calculation rounds down | One simple rule, and rounding can never create money |
| A3 | The smallest order is ₪100, except selling everything. There are no fees | The brief sets neither. Selling everything is exempt so a small remainder can always be cleared |

### Orders

| # | Assumption | Why |
|---|---|---|
| A4 | A buy takes its cash at submission, and spends that amount unless the 20% limit returns part of it | Stops pending buys from exceeding cash, which would be leverage |
| A5 | Portfolio value includes cash held for pending buys | That money still belongs to the player |
| A6 | Pending sale proceeds can't fund a buy | The cash doesn't exist until the sale fills |
| A7 | An order exactly at the open counts as in session, and exactly at the close as closed | The brief doesn't cover the boundary |
| A8 | An order before the open on a trading day fills at that day's open | "Next trading day" could also mean tomorrow, but today is what a player expects |
| A9 | Orders due at the same moment fill in submission order | Simple and fair |
| A10 | A repeated order id is rejected | A double tap must not charge twice |

### Selling

| # | Assumption | Why |
|---|---|---|
| A11 | At submission, a sale can't exceed the holding's value at the last price, minus pending sells | Blocks shorting early |
| A12 | At fill, a sale is capped at the units held, so it can return less than requested | The price may fall after submission, and shorting must stay impossible |
| A13 | A sale with nothing left to sell is recorded as filled with 0 units | Orders can't be cancelled, so it needs a final state |
| A13b | "Sell everything" sells every unit held at fill, including any bought by earlier orders filling first. Only one can be pending per security | Selling by amount can leave a small remainder |

### The 20% limit

| # | Assumption | Why |
|---|---|---|
| A14 | The base is the whole portfolio at last known prices, including closed markets | The brief doesn't define it |
| A15 | Holdings and pending buys of that security both count, but pending sells don't | Several orders can't pass the limit one by one. Ignoring sells is the cautious side |
| A16 | A holding that drifts above 20% is allowed, but adding to it is blocked | The rule applies at purchase |
| A16b | At fill, a buy that breaks the limit fills up to it and the rest of the cash is returned. With no room left it fills 0 units and returns everything | The player keeps most of what they asked for, and can't react because orders can't be cancelled |
| A16c | At fill, the limit is 20% of the portfolio at execution prices, and buys filling together are checked one after the other | "Moment of purchase" is the fill, when the price is known |

### Dollars

| # | Assumption | Why |
|---|---|---|
| A17 | There is no dollar balance: US sales convert straight to shekels at the rate at execution | Rule 5 only describes buying, and one currency keeps the portfolio simple |
| A17a | Players may type dollars or a number of shares. The app turns that into a shekel amount at today's price and rate, rounded down to the agora, and sends that. Typing every share you hold sends "sell everything" | Rules 2 and 5 keep orders in shekels, while shares and dollars are easier to think in. The price is unknown until the fill, so the share count is an estimate |
| A17b | When the dollar market is shut at the weekend, the last known rate applies until Monday | No market is open then. The price world must follow this, as the engine only receives the rate |

### Scoring

| # | Assumption | Why |
|---|---|---|
| A18 | Percentile = share of other players ranked below you, and ties share the average | The brief gives no formula |
| A19 | A lone player gets 100 | The formula divides by zero otherwise |
| A20 | Score ties go to higher return, then smaller drawdown, then player id | The order must always be the same |
| A21 | Return and drawdown are compared at 4 decimals of a percent | Differences below that count as ties |
| A23 | The week ends at the Friday US close, which belongs to the ending week. The next week starts from that value, so weekend gaps count for the new week | Tel Aviv closes hours earlier, and the competition should include all trading |
| A24 | The portfolio carries over between weeks, and only the score resets | The brief describes no reset |
| A25 | Drawdown is measured on every price step, the same for all players. It's calculated in batches at each market open and close, using `replaySteps` | Catches falls during the day without saving on every price step. A drop inside one step isn't seen |
| A26 | Only players who held a security at some point that week appear in the table | Stops abandoned accounts from scoring well. It also leaves out players who stay in cash on purpose, so we may revisit it |
| A27 | A player joining mid-week counts from when they joined | Their return is measured from their own start value |

### Calendar

| # | Assumption | Why |
|---|---|---|
| A22 | No holidays or half days beyond the Friday hours | The world is synthetic |

## The price world

The brief asks for 20 securities, prices over time and a dollar rate, and leaves the method to us. All of this is our choice.

| # | Choice | Why |
|---|---|---|
| W1 | 20 fictional securities: 10 in Tel Aviv, 10 in the US | Invented prices shouldn't sit next to real company names |
| W2 | Prices move in 5 game minute steps, the same for everyone, and only while their market is open | Gives drawdown a fixed definition (A25) |
| W3 | Each move combines the market, the sector and the security itself, at about 50%, 20% and 30% of the variance | Stocks fall together, so diversification has limits, as in real markets |
| W4 | Riskier securities have a larger daily move. Measured close to close, moves run about 1.2 times the stated size, because gaps and news add to it | Set per security in `securities.ts` |
| W5 | A market can open away from its last close, by about half a daily move | Orders placed while closed carry real overnight risk |
| W6 | Stocks get rare news jumps, a few times a year, worth 2 to 5 daily moves. Funds don't | Fat tails are what make a real market feel risky |
| W7 | The dollar moves only while a market is trading, and tends to rise when Tel Aviv falls | US holdings partly protect a portfolio. It stays frozen at the weekend (A17b) |
| W8 | Prices have no long-term growth | Keeps the model simple. It barely matters over one week |
| W9 | The two markets move independently, so one can't predict the other | Avoids an accidental way to read the next open |

### Keeping the future secret

The repo is public, so the generator's code can be read by anyone. The secret is the seed.

- **The server must use `secureNoise`** from `@portfolio-league/engine/secure-noise`, with `WORLD_SEED` as the secret. It uses HMAC-SHA256, so past prices can't reveal the seed. A simple random generator could be worked out from watching prices.
- **`createWorld` can answer for the future,** so it must only be called with times up to the world clock.
- **The browser never generates prices.** It reads them from the API, which only answers up to the world clock.
- **History is pinned.** A test fixes the exact prices of the first week. Changing the generator would rewrite history, so it fails that test on purpose and needs a new `WORLD_VERSION`.

Prices are worked out step by step from the start of the world and kept in memory. A year took about 10 seconds to generate on this Mac, so a server starting cold pays roughly 0.2 seconds per game week.

## The daily recap

This is not a game rule. It only describes the past, so it can't change a result.

| # | Choice | Why |
|---|---|---|
| D1 | "The last day" means the last 24 game hours | Works at any clock speed, and needs nothing stored |
| D2 | It measures the units held now, against prices a day ago. A holding bought today counts for the whole day | Without stored daily values, this is the closest honest figure |
| D3 | Best and worst are by percentage, not by shekels | A small holding can be the best performer |
| D4 | The Tel Aviv and US moves use the two broad index funds | They stand in for each market |

## Divisions

These don't change the score. They add a rank that lasts between weeks.

| # | Choice | Why |
|---|---|---|
| V1 | Four divisions: Bronze, Silver, Gold, Diamond. Everyone starts in Bronze | Few enough to climb in a short game |
| V2 | At the week's end, the top 25% of each division move up one and the bottom 25% move down one. Bronze can't drop and Diamond can't rise | A clear rule that fits in one sentence |
| V3 | Places come from the normal weekly table, read one division at a time | The brief's score stays the only score |
| V4 | The top quarter rounds up and the bottom rounds down | A small division still sends someone up, and nobody moves twice |
| V5 | Only players on the table move (A26) | Sitting in cash moves you in neither direction |
| V6 | Moves are saved in the same write as the week's result | A retry can't move anyone twice |

## Comparing with the market

| # | Choice | Why |
|---|---|---|
| I1 | The comparison uses the game's three index funds, not real indexes | Prices are invented, so real numbers would mean nothing here |
| I2 | Fund returns are in shekels, so US funds include the dollar's move | A player's return is in shekels too |
| I3 | "This week" starts at the previous Friday US close, or at the start of the world | The same start as the week in A23. A mid-week joiner's own return still starts when they joined (A27), so their comparison is only a guide |

## Worth raising in the README

- All-cash scores perfectly on stability. A26 only removes players who held nothing all week, so banking a win and sitting in cash still works.
- Divisions reward big bets, because return carries 85% of the score.

## Shown only: average price and taxes

These describe the past and never change cash, a fill or a score.

| # | Choice | Why |
|---|---|---|
| T1 | The average buy price weights each buy by its units. A sale keeps the average, and selling everything starts it again with the next buy | The usual way a broker shows it |
| T2 | "Paid" is the shekels actually spent, at each buy's dollar rate. Value now minus paid is the profit, so the holdings table adds up to the whole account | A US stock's profit includes the dollar's move, as the portfolio value does |
| T3 | Each sale is costed at the average paid for the units sold. A sale with no buy on record has no cost and is left out of taxes | Never guesses a number |
| T4 | Tax is 25% of each Israeli calendar year's net gain (gains minus losses), and 0 for a year that lost money. Years follow game time | Israel's capital gains rate, with losses offsetting gains in the same year. It's a lesson, not a charge |

Code: `averageBuyPrices`, `paidForHoldings`, `salesOf` and `taxYears` in `orders.ts`.

## Where the engine is used

The engine receives times and prices, and never reads the clock or the database. The API does that:

- **The shared clock:** `apps/api/src/clock.ts`.
- **The batches at each market open and close:** `apps/api/src/services/settlement.ts` and `league.ts`. They run `replaySteps` for the steps since the last open or close, then `settleDueOrders`, then `recordValue` with the value after fills, and `nextWeek` when the week ends.
