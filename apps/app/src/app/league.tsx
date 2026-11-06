import { divisionMoves, DIVISIONS } from '@portfolio-league/engine';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable } from '@/api/client';
import { TopThree } from '@/components/league-cards';
import {
  Card,
  changeColor,
  colors,
  DivisionTag,
  font,
  Hero,
  Page,
  percent,
  Segments,
} from '@/components/ui';
import { useGame, useLiveWorldTime } from '@/game/store';
import { useLeague } from '@/game/use-league';
import { DIVISION_LABEL, weekEndsIn } from '@/game/view';

const PPM_PER_PERCENT = 10_000;
const BOT_SUFFIX = / \(bot\)$/; // the tag below always shows, however narrow the screen
const PODIUM = 3;

type Week = 'this' | 'last';
type Shown = 'division' | 'everyone';
type Move = 'up' | 'down' | null;

const MOVE_TEXT = { up: '▲ Moving up', down: '▼ Moving down' };

function Countdown({ weekEndsAt }: { weekEndsAt: number }) {
  const { world } = useGame();
  const time = useLiveWorldTime();
  if (!world) return null;
  return <Text style={styles.heroStrong}>{weekEndsIn(world, weekEndsAt, time)}</Text>;
}

/** A finished week says who moved. This week's table says who would move if it ended now. */
function movesOf(table: LeagueTable, finished: boolean) {
  const moves = divisionMoves(table.rows);
  return (row: LeagueRow): Move => {
    const next = finished ? row.nextDivision : moves.get(row.id);
    if (!next || next === row.division) return null;
    return DIVISIONS.indexOf(next) > DIVISIONS.indexOf(row.division) ? 'up' : 'down';
  };
}

function Row({
  row,
  place,
  move,
  isMe,
}: {
  row: LeagueRow;
  place: number;
  move: Move;
  isMe: boolean;
}) {
  const returnPct = row.returnPpm / PPM_PER_PERCENT;
  const podium = place <= PODIUM;
  return (
    <View style={[styles.row, isMe && styles.me]}>
      <View style={[styles.rank, podium && styles.rankPodium]}>
        <Text style={styles.rankText}>{place}</Text>
      </View>
      <View style={styles.player}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name.replace(BOT_SUFFIX, '')}
            {isMe ? ' (you)' : ''}
          </Text>
          {row.bot ? <Text style={styles.botTag}>bot</Text> : null}
        </View>
        <Text style={styles.meta}>
          <Text style={[styles.strong, { color: changeColor(returnPct) }]}>{percent(returnPct)}</Text>
          {'  '}Max fall {(row.maxFallPpm / PPM_PER_PERCENT).toFixed(2)}%
        </Text>
        {move ? (
          <Text style={[styles.meta, styles.strong, { color: changeColor(move === 'up' ? 1 : -1) }]}>
            {MOVE_TEXT[move]}
          </Text>
        ) : null}
      </View>
      <View style={styles.scoreBox}>
        <Text style={styles.score}>{row.score.toFixed(0)}</Text>
        <Text style={styles.scoreLabel}>score</Text>
      </View>
    </View>
  );
}

export default function LeagueScreen() {
  const { me } = useGame();
  const [week, setWeek] = useState<Week>('this');
  const [shown, setShown] = useState<Shown>('division');
  const { table: current, previous, failed } = useLeague();

  if (!current) {
    return (
      <View style={styles.loading}>
        {failed ? (
          <Text style={styles.meta}>Can’t load the table right now.</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </View>
    );
  }

  const table = week === 'last' && previous ? previous : current;
  const finished = table === previous;
  const mine = table.rows.find((row) => row.id === me?.uid);
  const byDivision = shown === 'division' && mine;
  const rows = byDivision ? table.rows.filter((r) => r.division === mine.division) : table.rows;
  const moveOf = movesOf(table, finished);

  return (
    <Page maxWidth={720}>
      <Hero style={styles.hero}>
        <Text style={styles.heroLabel}>{week === 'last' ? 'Last week' : 'This week'}</Text>
        <Text style={styles.heroTitle}>
          {mine ? `You’re #${mine.rank} of ${table.total}` : 'You’re not on the table yet'}
        </Text>
        {mine ? (
          <View style={styles.heroTag}>
            <DivisionTag division={mine.division} label={DIVISION_LABEL[mine.division]} />
          </View>
        ) : null}
        <Text style={styles.heroLabel}>
          {mine || week === 'last'
            ? 'Score: 85% return rank, 15% stability rank. When the week ends, the top 25% of each division move up and the bottom 25% move down.'
            : 'Hold a security this week to join. The table updates at each market open and close.'}
        </Text>
        {week === 'this' && table.weekEndsAt ? <Countdown weekEndsAt={table.weekEndsAt} /> : null}
      </Hero>

      <TopThree previous={previous} />

      {previous ? (
        <Segments
          value={week}
          onChange={setWeek}
          options={[
            { value: 'this', label: 'This week' },
            { value: 'last', label: 'Last week' },
          ]}
        />
      ) : null}

      {mine ? (
        <Segments
          value={shown}
          onChange={setShown}
          options={[
            { value: 'division', label: `${DIVISION_LABEL[mine.division]} division` },
            { value: 'everyone', label: 'Everyone' },
          ]}
        />
      ) : null}

      {table.rows.length === 0 ? (
        <Card>
          <Text style={styles.meta}>The table starts at the next market open.</Text>
        </Card>
      ) : (
        <View style={styles.rows}>
          {rows.map((row, index) => (
            <Row
              key={row.id}
              row={row}
              place={byDivision ? index + 1 : row.rank}
              move={moveOf(row)}
              isMe={row.id === me?.uid}
            />
          ))}
        </View>
      )}

      {table.total > table.rows.length ? (
        <Text style={styles.meta}>
          Showing the top {table.rows.length} of {table.total} players.
        </Text>
      ) : null}
      <Link href="/admin" style={styles.link}>
        World clock
      </Link>
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { backgroundColor: colors.page, flex: 1, padding: 16 },
  hero: { gap: 4 },
  heroLabel: { color: colors.onPlum, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  heroTitle: { color: '#FFFFFF', fontFamily: font.display, fontSize: 32, fontWeight: '600' },
  heroTag: { flexDirection: 'row', marginVertical: 4 },
  heroStrong: { color: '#FFFFFF', fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  rows: { gap: 8 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  me: { backgroundColor: colors.brandSoft },
  rank: {
    alignItems: 'center',
    backgroundColor: colors.page,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rankPodium: { backgroundColor: colors.sun },
  rankText: { color: colors.ink, fontFamily: font.display, fontSize: 17, fontWeight: '700' },
  player: { flex: 1, minWidth: 0 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  name: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: font.body,
    fontSize: 15,
    fontWeight: '600',
  },
  botTag: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  meta: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  strong: { fontWeight: '600' },
  scoreBox: { alignItems: 'flex-end', minWidth: 44 },
  score: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '600' },
  scoreLabel: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  link: {
    color: colors.brand,
    fontFamily: font.body,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});
