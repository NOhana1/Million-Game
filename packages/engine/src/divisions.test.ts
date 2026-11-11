import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Division, divisionMoves, divisionRace } from './divisions.ts';

const group = (division: Division, size: number, prefix: string = division) =>
  Array.from({ length: size }, (_, i) => ({ id: `${prefix}${i}`, division }));

describe('divisionMoves', () => {
  it('moves the top quarter up and the bottom quarter down', () => {
    const moves = divisionMoves(group('silver', 8));
    assert.equal(moves.get('silver0'), 'gold');
    assert.equal(moves.get('silver1'), 'gold');
    assert.equal(moves.get('silver6'), 'bronze');
    assert.equal(moves.get('silver7'), 'bronze');
    assert.equal(moves.size, 4);
  });

  it('never moves anyone below bronze or above diamond', () => {
    const bronze = divisionMoves(group('bronze', 8));
    assert.deepEqual([...bronze.values()], ['silver', 'silver']);
    const diamond = divisionMoves(group('diamond', 8));
    assert.deepEqual([...diamond.values()], ['gold', 'gold']);
  });

  it('judges each division on its own, whatever the overall table says', () => {
    const table = [...group('gold', 4), ...group('bronze', 4)];
    const moves = divisionMoves(table);
    assert.equal(moves.get('bronze0'), 'silver'); // last half of the table, but first in bronze
    assert.equal(moves.get('gold3'), 'silver'); // above every bronze player, but last in gold
  });

  it('still sends someone up from a small division, and nobody down', () => {
    assert.deepEqual([...divisionMoves(group('silver', 1))], [['silver0', 'gold']]);
    assert.deepEqual([...divisionMoves(group('silver', 3))], [['silver0', 'gold']]);
  });

  it('moves nobody twice', () => {
    for (let size = 1; size <= 40; size++) {
      const moves = divisionMoves(group('silver', size));
      const up = [...moves.values()].filter((d) => d === 'gold').length;
      const down = [...moves.values()].filter((d) => d === 'bronze').length;
      assert.equal(up, Math.ceil(size / 4));
      assert.equal(down, Math.floor(size / 4));
    }
  });

  it('has nothing to do for an empty table', () => {
    assert.equal(divisionMoves([]).size, 0);
  });
});

describe('divisionRace', () => {
  // Best first, ten points apart: place 1 has 100, place 2 has 90 and so on.
  const race = (division: Division, size: number, place: number, others: Division[] = []) => {
    const rows = [
      ...Array.from({ length: size }, (_, i) => ({ id: `p${i + 1}`, division, score: 100 - i * 10 })),
      ...others.map((d, i) => ({ id: `x${i}`, division: d, score: 95 - i })),
    ].sort((a, b) => b.score - a.score);
    return divisionRace(rows, `p${place}`);
  };

  it('moving up: ahead of the first place that would not', () => {
    assert.deepEqual(race('silver', 12, 2), {
      division: 'silver',
      place: 2,
      size: 12,
      outcome: 'up',
      next: 'gold',
      rival: { place: 4, points: 20, ahead: true },
    });
  });

  it('staying: behind the last place that moves up', () => {
    const r = race('silver', 12, 5);
    assert.equal(r?.outcome, 'stay');
    assert.deepEqual(r?.rival, { place: 3, points: 20, ahead: false });
  });

  it('dropping: behind the last place that stays', () => {
    const r = race('silver', 12, 11);
    assert.equal(r?.outcome, 'down');
    assert.equal(r?.next, 'bronze');
    assert.deepEqual(r?.rival, { place: 9, points: 20, ahead: false });
  });

  it('the top division can only drop, so it counts from the first place that drops', () => {
    const r = race('diamond', 12, 4);
    assert.equal(r?.outcome, 'stay');
    assert.deepEqual(r?.rival, { place: 10, points: 60, ahead: true });
    assert.equal(race('diamond', 3, 1)?.rival, null); // too small for anyone to drop
  });

  it('the first division never drops', () => {
    assert.equal(race('bronze', 12, 12)?.outcome, 'stay');
    assert.deepEqual(race('bronze', 12, 12)?.rival, { place: 3, points: 90, ahead: false });
  });

  it('counts places inside the division only, and agrees with divisionMoves', () => {
    const r = race('silver', 4, 2, ['gold', 'bronze', 'gold']);
    assert.equal(r?.place, 2);
    assert.equal(r?.size, 4);
    assert.equal(r?.outcome, 'stay');
    assert.deepEqual(r?.rival, { place: 1, points: 10, ahead: false });
  });

  it('a player alone moves up with nobody to compare with, and a missing one has no race', () => {
    assert.equal(race('silver', 1, 1)?.outcome, 'up');
    assert.equal(race('silver', 1, 1)?.rival, null);
    assert.equal(divisionRace([], 'nobody'), null);
  });
});
