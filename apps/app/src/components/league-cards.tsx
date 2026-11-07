import { DIVISIONS } from '@portfolio-league/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable } from '@/api/client';
import { DivisionBadge } from '@/components/division-badge';
import { Card, changeColor, colors, Eyebrow, font, hover, percent } from '@/components/ui';
import { useGame } from '@/game/store';
import { DIVISION_LABEL, indexFunds, ppmToPercent, recapFor } from '@/game/view';

const TOP = 3;
const NO_NUMBER = '–';
const BOT_SUFFIX = / \(bot\)$/;

const seenKey = (weekEndsAt: number) => `week-summary-${weekEndsAt}`;

function summarySeen(weekEndsAt: number) {
  try {
    return globalThis.localStorage?.getItem(seenKey(weekEndsAt)) === 'seen';
  } catch {
    return false; // a blocked browser store only means the card shows again
  }
}

function SummaryFact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryFact}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[styles.summaryValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** How a player's week went, shown once when a new week starts. */
export function WeekSummary({ previous }: { previous: LeagueTable | null }) {
  const { me } = useGame();
  const [closed, setClosed] = useState<number | null>(null);
  const row = previous?.rows.find((r) => r.id === me?.uid);
  if (!previous || !row || !previous.weekEndsAt) return null;

  const endsAt = previous.weekEndsAt;
  if (closed === endsAt || summarySeen(endsAt)) return null;

  const close = () => {
    try {
      globalThis.localStorage?.setItem(seenKey(endsAt), 'seen');
    } catch {
      // nothing to do: it just shows again next time
    }
    setClosed(endsAt);
  };

  const next = row.nextDivision ?? row.division;
  const step = DIVISIONS.indexOf(next) - DIVISIONS.indexOf(row.division);
  const headline =
    step > 0
      ? `You moved up to ${DIVISION_LABEL[next]}!`
      : step < 0
        ? `You dropped to ${DIVISION_LABEL[next]}.`
        : `You stayed in ${DIVISION_LABEL[next]}.`;
  const value = ppmToPercent(row.returnPpm);
  const funds = Object.values(previous.indexes ?? {});
  const beaten = funds.filter((fund) => row.returnPpm > fund).length;

  return (
    <Card style={styles.summary}>
      <View style={styles.summaryTop}>
        <DivisionBadge division={next} size={52} />
        <View style={styles.resultText}>
          <Eyebrow>Your week</Eyebrow>
          <Text style={styles.summaryTitle}>{headline}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} {...hover('link')}>
          <Text style={styles.meta}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.summaryFacts}>
        <SummaryFact label="Place" value={`#${row.rank} of ${previous.total}`} />
        <SummaryFact label="Score" value={row.score.toFixed(0)} />
        <SummaryFact label="Return" value={percent(value)} color={changeColor(value)} />
        {funds.length > 0 ? (
          <SummaryFact label="Index funds beaten" value={`${beaten} of ${funds.length}`} />
        ) : null}
      </View>
    </Card>
  );
}

function Compared({ name, day, week, you }: { name: string; day?: number; week?: number; you?: boolean }) {
  const cell = (ppm?: number) => {
    if (ppm === undefined) return <Text style={[styles.number, styles.meta]}>{NO_NUMBER}</Text>;
    const value = ppmToPercent(ppm);
    return <Text style={[styles.number, { color: changeColor(value) }]}>{percent(value)}</Text>;
  };
  return (
    <View style={styles.line}>
      <Text style={[styles.name, you && styles.strong]} numberOfLines={1}>
        {name}
      </Text>
      {cell(day)}
      {cell(week)}
    </View>
  );
}

/** Your result next to the market's, in shekels, so a dollar move counts for both. */
export function MarketCompare({ table, row }: { table: LeagueTable | null; row?: LeagueRow }) {
  const { me, market, orders } = useGame();
  if (!me || !market) return null;

  const funds = indexFunds(market).map((fund) => ({ ...fund, weekPpm: table?.indexes?.[fund.id] }));
  const held = me.positions.length > 0;
  const beaten = row
    ? funds.filter((fund) => fund.weekPpm !== undefined && row.returnPpm > fund.weekPpm).length
    : 0;

  return (
    <Card ruled style={styles.card}>
      <Text style={styles.title}>You vs the market</Text>
      <Text style={styles.meta}>
        {row
          ? `This week you’re ahead of ${beaten} of ${funds.length} index funds, all in shekels.`
          : 'Hold a security to see how you compare this week.'}
      </Text>
      <View style={[styles.line, styles.head]}>
        <Text style={styles.name} />
        <Text style={[styles.number, styles.meta]}>Last day</Text>
        <Text style={[styles.number, styles.meta]}>This week</Text>
      </View>
      <Compared
        you
        name="You"
        day={held ? recapFor(me, market, orders).changePpm : undefined}
        week={row?.returnPpm}
      />
      {funds.map((fund) => (
        <Compared key={fund.id} name={fund.name} day={fund.dayPpm} week={fund.weekPpm} />
      ))}
    </Card>
  );
}

/** Last week's winners. Only their results show: what they held stays private. */
export function TopThree({ previous }: { previous: LeagueTable | null }) {
  const { me } = useGame();
  if (!previous?.rows.length) return null;
  return (
    <Card ruled style={styles.card}>
      <View style={styles.podiumTop}>
        <Text style={styles.title}>Last week’s top {TOP}</Text>
        <Text style={styles.meta}>Ranked by score</Text>
      </View>
      <View style={styles.podium}>
        {previous.rows.slice(0, TOP).map((row) => {
          const value = ppmToPercent(row.returnPpm);
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${row.name}`}
              onPress={() => router.push(`/profile/${row.id}`)}
              {...hover('lift')}
              style={styles.place}>
              <View style={styles.placeTop}>
                <Text style={styles.placeNumber}>{row.rank}</Text>
                <DivisionBadge division={row.division} size={30} />
              </View>
              <Text style={styles.placeName} numberOfLines={2}>
                {row.name.replace(BOT_SUFFIX, '')}
                {row.id === me?.uid ? ' (you)' : ''}
                {row.bot ? <Text style={styles.meta}> bot</Text> : null}
              </Text>
              <View style={styles.placeScores}>
                <View>
                  <Text style={styles.small}>Score</Text>
                  <Text style={styles.placeScore}>{row.score.toFixed(0)}</Text>
                </View>
                <View>
                  <Text style={[styles.small, styles.right]}>Return</Text>
                  <Text style={[styles.placeReturn, { color: changeColor(value) }]}>{percent(value)}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  summary: { borderColor: colors.brand, gap: 16 },
  summaryTop: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  summaryTitle: { color: colors.ink, fontFamily: font.display, fontSize: 26, fontWeight: '500' },
  summaryFacts: { columnGap: 24, flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  summaryFact: { flexBasis: 120, flexGrow: 1, gap: 3 },
  summaryValue: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  resultText: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  head: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 6 },
  line: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  name: { color: colors.ink, flex: 1, fontFamily: font.body, fontSize: 14, minWidth: 0 },
  strong: { fontWeight: '600' },
  number: {
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: 76,
    textAlign: 'right',
  },
  podiumTop: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  podium: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  place: {
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    flexBasis: 200,
    flexGrow: 1,
    gap: 10,
    padding: 16,
  },
  placeTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  placeNumber: { color: colors.brand, fontFamily: font.display, fontSize: 44, lineHeight: 48 },
  placeName: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500', minHeight: 20 },
  placeScores: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  placeScore: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 30,
    fontVariant: ['tabular-nums'],
    lineHeight: 36,
  },
  placeReturn: { fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
  small: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  right: { textAlign: 'right' },
});
