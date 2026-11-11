// Divisions: a rank that lasts longer than one week. Everyone is scored on the same weekly
// table, and each division's place in that table decides who moves when the week ends.

export const DIVISIONS = ['bronze', 'silver', 'gold', 'diamond'] as const;
export type Division = (typeof DIVISIONS)[number];

export const FIRST_DIVISION: Division = 'bronze';
export const MOVE_PERCENT = 25;

export type Placed = { id: string; division: Division };

/**
 * Takes the weekly table, best first, and returns only the players who move, with where to.
 * Rounding up the top means a small division still sends someone up.
 */
export function divisionMoves(table: readonly Placed[]): Map<string, Division> {
  const moves = new Map<string, Division>();
  DIVISIONS.forEach((division, index) => {
    const group = table.filter((player) => player.division === division);
    const up = Math.ceil((group.length * MOVE_PERCENT) / 100);
    const down = Math.floor((group.length * MOVE_PERCENT) / 100);
    const higher = DIVISIONS[index + 1];
    const lower = DIVISIONS[index - 1];
    if (higher) group.slice(0, up).forEach((player) => moves.set(player.id, higher));
    if (lower) group.slice(group.length - down).forEach((player) => moves.set(player.id, lower));
  });
  return moves;
}

export type RaceRow = Placed & { score: number };

/**
 * Where one player would land if the week ended now, and the one place that would change it.
 * `rival` is that place inside the division; `points` is the score between them, never negative.
 * Ahead means the player is safe by that many points; behind means they need that many.
 */
export type Race = {
  division: Division;
  place: number;
  size: number;
  outcome: 'up' | 'stay' | 'down';
  next: Division; // where they'd be next week
  rival: { place: number; points: number; ahead: boolean } | null;
};

/** The player's race in their own division, from the weekly table (best first). */
export function divisionRace(table: readonly RaceRow[], id: string): Race | null {
  const me = table.find((row) => row.id === id);
  if (!me) return null;
  const group = table.filter((row) => row.division === me.division);
  const index = group.indexOf(me);
  const next = divisionMoves(table).get(id) ?? me.division;
  const step = DIVISIONS.indexOf(next) - DIVISIONS.indexOf(me.division);
  const outcome = step > 0 ? 'up' : step < 0 ? 'down' : 'stay';

  // The same counts divisionMoves uses, so the card can't disagree with the week's end.
  const level = DIVISIONS.indexOf(me.division);
  const up = DIVISIONS[level + 1] ? Math.ceil((group.length * MOVE_PERCENT) / 100) : 0;
  const down = DIVISIONS[level - 1] ? Math.floor((group.length * MOVE_PERCENT) / 100) : 0;
  const firstDropping = group.length - down; // index of the first place that drops

  // The place that would change the outcome: the first one below you if you're moving up,
  // the last promoting place if you're staying, the last safe place if you're dropping.
  // At the top division you can only drop, so it's the first place that drops.
  let target: number | null;
  if (outcome === 'up') target = index + 1 < group.length ? up : null;
  else if (outcome === 'down') target = firstDropping - 1;
  else if (up > 0) target = up - 1;
  else target = down > 0 ? firstDropping : null;
  const rival = target === null ? undefined : group[target];

  return {
    division: me.division,
    place: index + 1,
    size: group.length,
    outcome,
    next,
    rival: rival
      ? {
          place: group.indexOf(rival) + 1,
          points: Math.abs(me.score - rival.score),
          ahead: index < group.indexOf(rival),
        }
      : null,
  };
}
