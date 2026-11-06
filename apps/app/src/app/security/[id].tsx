// One page per stock or fund: its price, an interactive chart, what it is and your position.

import { SECURITIES } from '@portfolio-league/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, PricePoint, Range, RANGES, RangeHistory } from '@/api/client';
import { OrderTicket } from '@/components/order-ticket';
import { ChartLoading, PriceChart } from '@/components/price-chart';
import {
  Button,
  changeColor,
  colors,
  Eyebrow,
  font,
  hover,
  ils,
  money,
  Page,
  percent,
  Tile,
  useWide,
} from '@/components/ui';
import { useGame } from '@/game/store';
import { MARKET_HOURS, PROFILES } from '@/game/profiles';
import {
  dayChange,
  displayPrice,
  findRow,
  MARKET_LABEL,
  orderAmount,
  scrubDate,
  toShekels,
  toUnits,
} from '@/game/view';

const FUND = 'Fund';
const RANGE_LABEL: Record<Range, string> = {
  '1D': 'past day',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  ALL: 'all history',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function RangeButtons({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  return (
    <View style={styles.ranges}>
      {RANGES.map((range) => {
        const active = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="button"
            accessibilityLabel={`Show ${RANGE_LABEL[range]}`}
            aria-selected={active}
            onPress={() => onChange(range)}
            {...hover('segment')}
            style={[styles.range, active && styles.rangeActive]}>
            <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{range}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SecurityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { market, me, orders, world } = useGame();
  const wide = useWide();
  const [range, setRange] = useState<Range>('1M');
  const [loaded, setLoaded] = useState<Partial<Record<Range, RangeHistory>>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scrub, setScrub] = useState<PricePoint | null>(null);
  const [ticket, setTicket] = useState<'buy' | 'sell' | null>(null);

  // Another security reuses this screen, so what was loaded for the last one has to go.
  useEffect(() => {
    setLoaded({});
    setScrub(null);
    setRange('1M');
  }, [id]);

  const history = loaded[range];
  useEffect(() => {
    if (history || !id) return;
    let current = true;
    setFailed(false);
    api
      .history(id, range)
      .then((result) => current && setLoaded((all) => ({ ...all, [range]: result })))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [id, range, history, attempt]);

  if (!market || !me || !world) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const row = id ? findRow(market, id) : undefined;
  if (!row) {
    return (
      <Page maxWidth={640}>
        <Text style={styles.name}>We can’t find that security</Text>
        <Button variant="quiet" label="Back to the market" onPress={() => router.replace('/')} />
      </Page>
    );
  }

  const currency = row.market === 'US' ? '$' : '₪';
  const format = (price: number) => money(displayPrice(price), currency);
  const points = history?.points ?? [];
  const first = points[0]?.price ?? row.price;
  const shown = scrub?.price ?? row.price;
  const change = (shown / first - 1) * 100;
  const prices = points.map((p) => p.price);
  const profile = PROFILES[row.id];
  const fund = row.sector === FUND;
  const dailyVol = SECURITIES.find((s) => s.id === row.id)?.dailyVol ?? 0;
  const position = me.positions.find((p) => p.securityId === row.id);
  const waiting = orders.filter((o) => o.status === 'pending' && o.securityId === row.id);
  const open = world.markets[row.market].open;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const chart = (
    <View style={styles.chart}>
      {failed ? (
        <View style={styles.problem}>
          <Text style={styles.body}>The chart didn’t load.</Text>
          <Button variant="quiet" label="Try again" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : history ? (
        <PriceChart
          points={points}
          range={range}
          height={wide ? 380 : 280}
          format={format}
          onScrub={setScrub}
        />
      ) : (
        <ChartLoading height={wide ? 380 : 280} />
      )}
      <RangeButtons
        value={range}
        onChange={(next) => {
          setScrub(null);
          setRange(next);
        }}
      />
    </View>
  );

  return (
    <>
      <Page>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" onPress={back} {...hover('link')}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Eyebrow>
            {row.sector} · {MARKET_LABEL[row.market]} · {row.id}
          </Eyebrow>
        </View>

        <View style={[styles.head, wide && styles.headWide]}>
          <View style={styles.flex}>
            <View style={styles.title}>
              <Tile id={row.id} name={row.name} size={wide ? 52 : 42} />
              <Text style={[styles.name, !wide && styles.namePhone]}>{row.name}</Text>
            </View>
            <Text style={[styles.price, !wide && styles.pricePhone]}>{format(shown)}</Text>
            <Text style={[styles.change, { color: changeColor(change) }]}>
              {percent(change)}
              <Text style={styles.changeLabel}>
                {'  '}
                {scrub ? scrubDate(scrub.at, range) : RANGE_LABEL[range]}
              </Text>
            </Text>
          </View>
          <View style={[styles.actions, !wide && styles.actionsPhone]}>
            <View style={styles.flex}>
              <Button label="Buy" onPress={() => setTicket('buy')} />
            </View>
            {position ? (
              <View style={styles.flex}>
                <Button variant="quiet" label="Sell" onPress={() => setTicket('sell')} />
              </View>
            ) : null}
          </View>
        </View>

        {chart}

        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={[styles.about, wide && styles.aboutWide]}>
            <Eyebrow style={styles.gold}>Fictional company in this game</Eyebrow>
            <Text style={[styles.focus, !wide && styles.focusPhone]}>{profile?.focus}</Text>
            <Text style={styles.body}>{profile?.about}</Text>
          </View>

          <View style={styles.flex}>
            <View style={styles.facts}>
              <Fact label="Type" value={fund ? 'Index fund' : 'Company'} />
              <Fact label="Sector" value={fund ? 'Broad market' : row.sector} />
              <Fact label="Trades in" value={`${MARKET_LABEL[row.market]}, ${currency === '$' ? 'dollars' : 'shekels'}`} />
              <Fact label="Right now" value={open ? 'Market open' : 'Market closed'} />
              <Fact label="Today" value={percent(dayChange(row))} />
              <Fact label="Typical daily move" value={`${(dailyVol * 100).toFixed(1)}%`} />
              {prices.length > 0 ? (
                <>
                  <Fact label={`High, ${RANGE_LABEL[range]}`} value={format(Math.max(...prices))} />
                  <Fact label={`Low, ${RANGE_LABEL[range]}`} value={format(Math.min(...prices))} />
                </>
              ) : null}
            </View>
            <Text style={styles.hours}>{MARKET_HOURS[row.market]}</Text>
          </View>
        </View>

        {position || waiting.length > 0 ? (
          <View style={styles.position}>
            <Eyebrow>Your position</Eyebrow>
            <View style={styles.facts}>
              {position ? (
                <>
                  <Fact label="Value" value={ils(toShekels(position.value))} />
                  <Fact label="Units" value={toUnits(position.units).toFixed(2)} />
                  <Fact
                    label="Share of portfolio"
                    value={`${((position.value / me.value) * 100).toFixed(1)}%`}
                  />
                </>
              ) : null}
              {waiting.map((order) => (
                <Fact
                  key={order.id}
                  label={`Waiting ${order.side}`}
                  value={ils(orderAmount(order))}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Page>
      {ticket ? (
        <OrderTicket security={row} startSide={ticket} onClose={() => setTicket(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  back: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  head: { gap: 16 },
  headWide: { alignItems: 'flex-end', flexDirection: 'row' },
  title: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  name: { color: colors.ink, fontFamily: font.display, fontSize: 38, fontWeight: '500', lineHeight: 46 },
  namePhone: { flexShrink: 1, fontSize: 28, lineHeight: 34 },
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
  actions: { flexDirection: 'row', gap: 10, minWidth: 260 },
  actionsPhone: { minWidth: 0 },
  chart: { gap: 12 },
  problem: { alignItems: 'center', gap: 12, justifyContent: 'center', minHeight: 280 },
  ranges: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', paddingTop: 10 },
  range: { alignItems: 'center', borderRadius: 3, flex: 1, justifyContent: 'center', minHeight: 38 },
  rangeActive: { backgroundColor: colors.brand },
  rangeText: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  rangeTextActive: { color: colors.onBrand },
  columns: { borderTopColor: colors.line, borderTopWidth: 1, gap: 28, paddingTop: 24 },
  columnsWide: { flexDirection: 'row', gap: 56 },
  about: { gap: 10 },
  aboutWide: { flex: 1, maxWidth: 480 },
  gold: { color: colors.brand },
  focus: { color: colors.ink, fontFamily: font.display, fontSize: 30, fontWeight: '500', lineHeight: 38 },
  focusPhone: { fontSize: 25, lineHeight: 32 },
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
  hours: { color: colors.faint, fontFamily: font.body, fontSize: 12, marginTop: 16 },
  position: { borderTopColor: colors.line, borderTopWidth: 1, gap: 14, paddingTop: 20 },
});
