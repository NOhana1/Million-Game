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
| `POST /players` | Yes | No | Create the player. Body `{ "name": "Noa" }`, 2 to 24 characters. Returns 201, or 200 with the existing player, who is never reset |
| `GET /me` | Yes | No | The player's portfolio. 404 `PLAYER_NOT_FOUND` means call `POST /players` first |
| `GET /world` | No | 5s | World time, and for each market whether it's open and when that next changes |
| `GET /market` | No | 5s | All securities with `price`, `priceDayAgo`, and `usdIls` |
| `GET /market/:id/history` | No | 60s | Chart points for the last 5 world days, ending at the current price |

`GET /me` also returns `worldTime`, `reserved` (cash held for pending buys), `value` (whole portfolio) and `positions`.

## Orders

| Method and path | Sign-in | Cached | Purpose |
|---|---|---|---|
| `POST /orders` | Yes | No | Body `{ "id": "<new UUID>", "securityId": "TAIX", "side": "buy", "amount": 100000 }`, with `amount` in agorot. Returns 201 with the order |
| `GET /me/orders` | Yes | No | Order history, newest first. Optional `?limit=` (up to 50) and `?after=<next>`. Returns `{ orders, next }`, and `next` is null on the last page |

- **Make the UUID once per order, not once per request.** Send the same id on any retry: the server then returns the original order with status 200 and charges nothing.
- **There is no cancel route, on purpose** (Rule 3).

| Error code | Status | Meaning |
|---|---|---|
| `INSUFFICIENT_CASH` | 422 | Not enough available cash |
| `POSITION_LIMIT` | 422 | More than 20% in one security |
| `INSUFFICIENT_HOLDING` | 422 | Selling more than is held |
| `TOO_MANY_PENDING` | 409 | Already 50 orders waiting |
| `UNKNOWN_SECURITY` | 404 | No such security |
| `PLAYER_NOT_FOUND` | 404 | Call `POST /players` first |
| `INVALID_BODY` | 400 | The request is malformed |
| `UNAUTHENTICATED` | 401 | Sign in again |
