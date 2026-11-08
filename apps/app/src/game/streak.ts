// When to count today's visit toward the daily streak. The server decides the day; this only
// decides when to ask, so a game left open overnight or reopened from the home screen still counts.

const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date in Israel, as YYYY-MM-DD, the same way the server counts it. */
export const israelDay = (realNow: number) => ISRAEL_DAY.format(realNow);

/**
 * The visit to send now, or null. Asks once per player per day, so a phone with a wrong clock
 * can't ask again on every refresh.
 */
export function visitDue(uid: string, lastDay: string | undefined, sentFor: string, realNow: number) {
  const today = israelDay(realNow);
  const visit = `${uid}:${today}`;
  return lastDay === today || sentFor === visit ? null : visit;
}
