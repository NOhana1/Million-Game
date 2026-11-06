import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Division, divisionMoves } from './divisions.ts';

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
