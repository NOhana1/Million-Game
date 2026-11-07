import { DIVISIONS } from '@portfolio-league/engine';
import { StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable } from '@/api/client';
import { DivisionBadge } from '@/components/division-badge';
import { Card, changeColor, colors, font, hover, percent } from '@/components/ui';
import { useGame } from '@/game/store';
import { DIVISION_LABEL, indexFunds, ppmToPercent, recapFor } from '@/game/view';

const TOP = 3;
const NO_NUMBER = '–';
const BOT_SUFFIX = / \(bot\)$/;

/** Tells a returning player what last week did to their division. */
export function WeekResult({ previous }: { previous: LeagueTable | null }) {
  const { me } = useGame();
  const row = previous?.rows.find((r) => r.id === me?.uid);
  if (!row?.nextDivision) return null;

  const next = DIVISION_LABEL[row.nextDivision];
  const step = DIVISIONS.indexOf(row.nextDivision) - DIVISIONS.indexOf(row.division);
  const text =
    step > 0 ? `You moved up to ${next}!` : step < 0 ? `You dropped to ${next}.` : `You stayed in ${next}.`;
  return (
    <Card style={styles.result}>
      <DivisionBadge division={row.nextDivision} size={40} />
      <View style={styles.resultText}>
        <Text style={styles.title}>{text}</Text>
        <Text style={styles.meta}>
          You finished #{row.rank} of {previous?.total} last week.
        </Text>
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
            <View key={row.id} {...hover('line')} style={styles.place}>
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
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  result: { alignItems: 'center', borderColor: colors.brand, flexDirection: 'row', gap: 14 },
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
