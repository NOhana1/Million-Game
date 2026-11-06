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
