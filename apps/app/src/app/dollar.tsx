// The dollar's own page: today's rate and a chart, like a stock. US securities are bought and sold
// at this rate, so it moves the value of every US holding.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, DOLLAR_RANGES, PricePoint, Range, RangeHistory } from '@/api/client';
import { ChartFooter } from '@/components/chart-footer';
import { ChartLoading, type ChartKind, PriceChart } from '@/components/price-chart';
import { RANGE_LABEL, RangeButtons } from '@/components/range-buttons';
import { Button, changeColor, colors, Eyebrow, font, hover, Page, percent, useWide } from '@/components/ui';
import { useGame } from '@/game/store';
import { displayFx, scrubDate } from '@/game/view';

const format = (fx: number) => `₪${displayFx(fx).toFixed(3)}`;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function DollarScreen() {
  const { market } = useGame();
  const wide = useWide();
  const [range, setRange] = useState<Range>('1M');
  const [kind, setKind] = useState<ChartKind>('line');
  const [loaded, setLoaded] = useState<Partial<Record<Range, RangeHistory>>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scrub, setScrub] = useState<PricePoint | null>(null);

  const history = loaded[range];
  useEffect(() => {
    if (history) return;
    let current = true;
    setFailed(false);
    api
      .dollarHistory(range)
      .then((result) => current && setLoaded((all) => ({ ...all, [range]: result })))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [range, history, attempt]);

  if (!market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const points = history?.points ?? [];
  const first = points[0]?.price ?? market.usdIls;
  const shown = scrub?.price ?? market.usdIls;
  const change = (shown / first - 1) * 100;
  const today = market.usdIlsDayAgo ? (market.usdIls / market.usdIlsDayAgo - 1) * 100 : 0;
  const prices = points.map((p) => p.price);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const height = wide ? 380 : 280;

  return (
    <Page>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={back} {...hover('link')}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Eyebrow>Currency · USD/ILS</Eyebrow>
      </View>

      <View>
        <Text style={[styles.name, !wide && styles.namePhone]}>US dollar</Text>
        <Text style={[styles.price, !wide && styles.pricePhone]}>{format(shown)}</Text>
        <Text style={[styles.change, { color: changeColor(change) }]}>
          {percent(change)}
          <Text style={styles.changeLabel}>
            {'  '}
            {scrub ? scrubDate(scrub.at, range) : RANGE_LABEL[range]}
          </Text>
        </Text>
      </View>

      <View style={styles.chart}>
        {failed ? (
          <View style={[styles.problem, { minHeight: height }]}>
            <Text style={styles.body}>The chart didn’t load.</Text>
            <Button variant="quiet" label="Try again" onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : history ? (
          <PriceChart points={points} range={range} height={height} format={format} onScrub={setScrub} kind={kind} />
        ) : (
          <ChartLoading height={height} />
        )}
        <RangeButtons
          ranges={DOLLAR_RANGES}
          value={range}
          onChange={(next) => {
            setScrub(null);
            setRange(next);
          }}
        />
        <ChartFooter
          kind={kind}
          onKind={(next) => {
            setScrub(null);
            setKind(next);
          }}
        />
      </View>

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={[styles.about, wide && styles.aboutWide]}>
          <Eyebrow style={styles.gold}>How the dollar works here</Eyebrow>
          <Text style={styles.body}>
            The game’s dollar started near the real rate and then moves on its own, like a stock: only
            while a market is trading, and it tends to rise when Tel Aviv falls. US securities are bought
            and sold at the rate when the order fills, so a stronger dollar raises the value of your US
            holdings in shekels.
          </Text>
        </View>
        <View style={[styles.facts, styles.flex]}>
          <Fact label="Today" value={percent(today)} />
          <Fact label="$1 buys" value={format(market.usdIls)} />
          {prices.length > 0 ? (
            <>
              <Fact label={`High, ${RANGE_LABEL[range]}`} value={format(Math.max(...prices))} />
              <Fact label={`Low, ${RANGE_LABEL[range]}`} value={format(Math.min(...prices))} />
            </>
          ) : null}
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  back: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  name: { color: colors.ink, fontFamily: font.display, fontSize: 38, fontWeight: '500', lineHeight: 46 },
  namePhone: { fontSize: 28, lineHeight: 34 },
  price: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 76,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 88,
    marginTop: 10,
  },
  pricePhone: { fontSize: 52, lineHeight: 62 },
  change: { fontFamily: font.body, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '600' },
  changeLabel: { color: colors.muted, fontWeight: '400' },
  chart: { gap: 12 },
  problem: { alignItems: 'center', gap: 12, justifyContent: 'center' },
  columns: { borderTopColor: colors.line, borderTopWidth: 1, gap: 28, paddingTop: 24 },
  columnsWide: { flexDirection: 'row', gap: 56 },
  about: { gap: 10 },
  aboutWide: { flex: 1, maxWidth: 480 },
  gold: { color: colors.brand },
  body: { color: colors.onDeep, fontFamily: font.body, fontSize: 16, lineHeight: 26 },
  facts: { columnGap: 24, flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  fact: { flexBasis: '44%', flexGrow: 1, gap: 4, minWidth: 130 },
  factValue: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});
