import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newDrawdown, percentile, rankPlayers, returnPpm, trackDrawdown } from './index.ts';

describe('percentile', () => {
  it('gives 100 to the highest and 0 to the lowest', () => {
    const values = [1, 2, 3, 4, 5];
    assert.equal(percentile(values, 5), 100);
    assert.equal(percentile(values, 3), 50);
    assert.equal(percentile(values, 1), 0);
  });

  it('gives tied players the same average', () => {
    assert.equal(percentile([1, 2, 2, 3], 2), 50);
    assert.equal(percentile([7, 7, 7], 7), 50);
  });

  it('gives a lone player 100', () => {
    assert.equal(percentile([9], 9), 100);
  });
});

describe('returnPpm', () => {
  it('measures gains and losses from the start value', () => {
    assert.equal(returnPpm(100_000_000, 110_000_000), 100_000);
    assert.equal(returnPpm(100_000_000, 90_000_000), -100_000);
    assert.equal(returnPpm(100_000_000, 100_000_000), 0);
  });
});

describe('trackDrawdown', () => {
  const run = (values: number[]) =>
    values.reduce(trackDrawdown, newDrawdown(values[0] ?? 0)).maxFallPpm;

  it('is zero while the value only rises', () => {
    assert.equal(run([100, 110, 120]), 0);
  });

  it('measures the fall from the peak, not from the start', () => {
    assert.equal(run([100, 200, 150]), 250_000);
  });

  it('keeps the largest fall after a recovery', () => {
    assert.equal(run([100, 50, 100, 90]), 500_000);
  });

  it('compares each trough with the peak before it', () => {
    assert.equal(run([100, 80, 300, 270]), 200_000);
  });

  it('handles a portfolio worth zero', () => {
    assert.equal(run([0, 0]), 0);
    assert.equal(run([100, 0]), 1_000_000);
  });
});

describe('rankPlayers (rule 6)', () => {
  it('weights return rank 85% and stability rank 15%', () => {
    const [first, second] = rankPlayers([
      { id: 'steady', returnPpm: 10, maxFallPpm: 1 },
      { id: 'wild', returnPpm: 20, maxFallPpm: 2 },
    ]);
    assert.equal(first?.id, 'wild');
    assert.equal(first?.score, 85);
    assert.equal(second?.score, 15);
  });

  it('gives 100 to the best return and smallest fall', () => {
    const [best] = rankPlayers([
      { id: 'a', returnPpm: 30, maxFallPpm: 0 },
      { id: 'b', returnPpm: 20, maxFallPpm: 5 },
      { id: 'c', returnPpm: 10, maxFallPpm: 9 },
    ]);
    assert.equal(best?.returnRank, 100);
    assert.equal(best?.stabilityRank, 100);
    assert.equal(best?.score, 100);
  });

  it('gives a lone player 100', () => {
    assert.equal(rankPlayers([{ id: 'a', returnPpm: -5, maxFallPpm: 9 }])[0]?.score, 100);
  });

  it('breaks a full tie by id, so the order is always the same', () => {
    const ranked = rankPlayers([
      { id: 'b', returnPpm: 5, maxFallPpm: 5 },
      { id: 'a', returnPpm: 5, maxFallPpm: 5 },
    ]);
    assert.deepEqual(
      ranked.map((p) => p.id),
      ['a', 'b'],
    );
  });

  it('returns the same order whatever the input order', () => {
    const players = [
      { id: 'a', returnPpm: 1, maxFallPpm: 3 },
      { id: 'b', returnPpm: 2, maxFallPpm: 2 },
      { id: 'c', returnPpm: 3, maxFallPpm: 1 },
    ];
    assert.deepEqual(rankPlayers(players), rankPlayers([...players].reverse()));
  });

  it('handles no players', () => {
    assert.deepEqual(rankPlayers([]), []);
  });
});
