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
| R4 | One security can't exceed 20% at the moment of purchase | **Partly:** checked at submission only. The fill-time check is Stage 2 | `orders.ts` |
| R5 | US securities convert at the dollar rate at execution | Done: the caller supplies the rate at execution | `orders.ts` |
| R6 | Score = 0.85 × return rank + 0.15 × stability rank | **Partly:** the formula and drawdown are done. The Monday to Friday window is Stage 2 | `score.ts` |
| Hours | Tel Aviv Mon-Thu 10:00-17:30, Fri 10:00-13:50. US 9:30-16:00 | Done, in each market's own time zone | `calendar.ts` |

## Assumptions

### Money

| # | Assumption | Why |
|---|---|---|
| A1 | Cash is whole agorot, prices and the dollar rate have 4 decimals, units have 6 decimals | Whole numbers give the same result on every device |
| A2 | Every calculation rounds down | One simple rule, and rounding can never create money |
| A3 | The smallest order is 1 agora | The brief sets no minimum. See Q7 |

### Orders

| # | Assumption | Why |
|---|---|---|
| A4 | A buy takes its cash at submission and spends exactly that amount | Stops pending buys from exceeding cash, which would be leverage |
| A5 | Portfolio value includes cash held for pending buys | That money still belongs to the player |
| A6 | Pending sale proceeds can't fund a buy | The cash doesn't exist until the sale fills |
| A7 | An order exactly at the open counts as in session, and exactly at the close as closed | The brief doesn't cover the boundary |
| A8 | An order before the open on a trading day fills at that day's open | "Next trading day" could also mean tomorrow. See Q2 |
| A9 | Orders due at the same moment fill in submission order | Simple and fair |
| A10 | A repeated order id is rejected | A double tap must not charge twice |

### Selling

| # | Assumption | Why |
|---|---|---|
| A11 | At submission, a sale can't exceed the holding's value at the last price, minus pending sells | Blocks shorting early |
| A12 | At fill, a sale is capped at the units held, so it can return less than requested | The price may fall after submission, and shorting must stay impossible |
| A13 | A sale with nothing left to sell is recorded as filled with 0 units | Orders can't be cancelled, so it needs a final state |

### The 20% limit

| # | Assumption | Why |
|---|---|---|
| A14 | The base is the whole portfolio at last known prices, including closed markets | The brief doesn't define it |
| A15 | Holdings and pending buys of that security both count, but pending sells don't | Several orders can't pass the limit one by one. Ignoring sells is the cautious side |
| A16 | A holding that drifts above 20% is allowed, but adding to it is blocked | The rule applies at purchase |

### Dollars

| # | Assumption | Why |
|---|---|---|
| A17 | There is no dollar balance: US sales convert straight to shekels at the rate at execution | Rule 5 only describes buying, and one currency keeps the portfolio simple |

### Scoring

| # | Assumption | Why |
|---|---|---|
| A18 | Percentile = share of other players ranked below you, and ties share the average | The brief gives no formula |
| A19 | A lone player gets 100 | The formula divides by zero otherwise |
| A20 | Score ties go to higher return, then smaller drawdown, then player id | The order must always be the same |
| A21 | Return and drawdown are compared at 4 decimals of a percent | Differences below that count as ties |

### Calendar

| # | Assumption | Why |
|---|---|---|
| A22 | No holidays or half days beyond the Friday hours | The world is synthetic |

## Open questions

| # | Question | My recommendation |
|---|---|---|
| Q1 | A buy passes 20% at submission but breaks it at fill. Reject it, or fill part of it? | Fill up to the limit and return the rest of the cash. This is needed for Stage 2 |
| Q2 | Does an order before the open fill today or on the next day? | Today (A8) |
| Q3 | Should there be a "sell everything" order? Selling by amount can leave a small remainder | Yes, it's a small addition |
| Q4 | When does the week start and end, given that Tel Aviv closes hours before the US? | End at the Friday US close, and start from the previous week's end value |
| Q5 | How often is drawdown measured? | At each market open and close, the same for everyone |
| Q6 | Who counts in the table: inactive accounts, or players joining mid-week? | Decide in Stage 2, because all-cash scores perfectly on stability |
| Q7 | Should there be a minimum order or a fee? | A small minimum, and no fee because the brief has none |
| Q8 | Which rate applies when the dollar market is shut at the weekend? | The last known rate |

## Not in the engine yet

- **Prices and the dollar rate (Stage 3).** The engine receives them, and never generates them.
- **The shared clock (Stage 6).** The engine receives times, and never reads the clock.
