import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, PricePoint, Range } from '@/api/client';
import { currentToken } from '@/api/session';
import { useGame } from '@/game/store';
import { scrubDate, toShekels } from '@/game/view';

import { ChartLoading, PriceChart } from './price-chart';
import { RANGE_LABEL, RangeButtons } from './range-buttons';
import { changeColor, colors, font, ils, percent, useWide } from './ui';

const RANGES: readonly Range[] = ['1D', '1W', '1M', '3M', 'ALL'];

/** The player's own money over time, rebuilt by the server from their filled orders. */
export function PortfolioChart() {
  const { orders } = useGame();
  const wide = useWide();
  const [range, setRange] = useState<Range>('ALL');
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [scrub, setScrub] = useState<PricePoint | null>(null);
  const fills = orders.filter((order) => order.status === 'filled').length;

  useEffect(() => {
    let current = true;
    setPoints(null);
    currentToken()
      .then((token) => (token ? api.myHistory(token, range) : null))
      .then((history) => current && setPoints(history?.points ?? []))
      .catch(() => current && setPoints([]));
    return () => {
      current = false;
    };
  }, [range, fills]);

  const height = wide ? 260 : 200;
  if (points?.length === 0 && fills === 0) {
    return <Text style={styles.empty}>Your chart starts with your first filled order.</Text>;
  }

  const first = points?.[0]?.price ?? 0;
  const shown = scrub ?? points?.at(-1);
  const change = shown && first ? (shown.price / first - 1) * 100 : 0;
  // A player's history is short, so ALL reads better as dates than as years.
  const axis = range === 'ALL' ? '3M' : range;

  return (
    <View style={styles.box}>
      <Text style={styles.line}>
        {shown ? ils(toShekels(shown.price)) : ' '}
        <Text style={{ color: changeColor(change) }}>
          {'  '}
          {percent(change)}
        </Text>
        <Text style={styles.label}>
          {'  '}
          {scrub ? scrubDate(scrub.at, axis) : RANGE_LABEL[range]}
        </Text>
      </Text>
      {points && points.length > 1 ? (
        <PriceChart
          points={points}
          range={axis}
          height={height}
          format={(value) => ils(toShekels(value))}
          onScrub={setScrub}
        />
      ) : (
        <ChartLoading height={height} />
      )}
      <RangeButtons
        ranges={RANGES}
        value={range}
        onChange={(next) => {
          setScrub(null);
          setRange(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  line: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600' },
  label: { color: colors.muted, fontWeight: '400' },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14, paddingVertical: 8 },
});
