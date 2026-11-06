import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, LeagueRow, LeagueTable } from '@/api/client';
import { Card, changeColor, colors, font, Hero, Page, percent, Segments } from '@/components/ui';
import { useGame } from '@/game/store';
import { useLeague } from '@/game/use-league';

const PPM_PER_PERCENT = 10_000;
const BOT_SUFFIX = / \(bot\)$/; // the tag below always shows, however narrow the screen
const PODIUM = 3;

type Week = 'this' | 'last';

function Row({ row, isMe }: { row: LeagueRow; isMe: boolean }) {
  const returnPct = row.returnPpm / PPM_PER_PERCENT;
  const podium = row.rank <= PODIUM;
  return (
    <View style={[styles.row, isMe && styles.me]}>
      <View style={[styles.rank, podium && styles.rankPodium]}>
        <Text style={styles.rankText}>{row.rank}</Text>
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
  const [previous, setPrevious] = useState<LeagueTable | null>(null);
  const { table: current, failed } = useLeague();

  const lastWeekEnd = current?.previousWeekEndsAt ?? null;
  useEffect(() => {
    if (lastWeekEnd === null) return;
    api.finishedWeek(lastWeekEnd).then(setPrevious, () => setPrevious(null));
  }, [lastWeekEnd]);

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
  const mine = table.rows.find((row) => row.id === me?.uid);

  return (
    <Page maxWidth={720}>
      <Hero style={styles.hero}>
        <Text style={styles.heroLabel}>{week === 'last' ? 'Last week' : 'This week'}</Text>
        <Text style={styles.heroTitle}>
          {mine ? `You’re #${mine.rank} of ${table.total}` : 'You’re not on the table yet'}
        </Text>
        <Text style={styles.heroLabel}>
          {mine || week === 'last'
            ? 'Score: 85% return rank, 15% stability rank.'
            : 'Hold a security this week to join. The table updates at each market open and close.'}
        </Text>
      </Hero>

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

      {table.rows.length === 0 ? (
        <Card>
          <Text style={styles.meta}>The table starts at the next market open.</Text>
        </Card>
      ) : (
        <View style={styles.rows}>
          {table.rows.map((row) => (
            <Row key={row.id} row={row} isMe={row.id === me?.uid} />
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
