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

## Worth raising in the README

- All-cash scores perfectly on stability. A26 only removes players who held nothing all week, so banking a win and sitting in cash still works.

## Not in the engine yet

- **Prices and the dollar rate (Stage 3).** The engine receives them, and never generates them.
- **The shared clock (Stage 6).** The engine receives times, and never reads the clock.
- **Running the batches (backend).** At each market open and close: run `replaySteps` for the steps since the last check, then `settleDueOrders`, then `recordValue` with the value after fills. At the week's end, run `nextWeek`.
