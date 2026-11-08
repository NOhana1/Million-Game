// The daily streak: how many days in a row a player has opened the game. Days follow Israel's
// calendar, so a streak doesn't break at midnight in London.

export type Streak = { days: number; best: number; lastDay: string }; // lastDay is YYYY-MM-DD

const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date in Israel at this real time, as YYYY-MM-DD. */
export const israelDay = (realNow: number) => ISRAEL_DAY.format(realNow);

function dayBefore(day: string) {
  const noon = new Date(`${day}T12:00:00Z`); // noon, so a day earlier never lands on the wrong date
  noon.setUTCDate(noon.getUTCDate() - 1);
  return noon.toISOString().slice(0, 10);
}

/** Another visit today changes nothing. Yesterday's streak grows. Any longer gap starts again at 1. */
export function nextStreak(previous: Streak | undefined, today: string): Streak {
  if (previous?.lastDay === today) return previous;
  const days = previous?.lastDay === dayBefore(today) ? previous.days + 1 : 1;
  return { days, best: Math.max(days, previous?.best ?? 0), lastDay: today };
}
