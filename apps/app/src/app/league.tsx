import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, StyleSheet, Text, View } from 'react-native';

import { api, LeagueRow, LeagueTable } from '@/api/client';
import { Card, changeColor, colors, percent, Segments } from '@/components/ui';
import { useGame } from '@/game/store';

const REFRESH_MS = 30_000; // the table only changes at market opens and closes
const PPM_PER_PERCENT = 10_000;
const BOT_SUFFIX = / \(bot\)$/; // the tag below always shows, however narrow the screen

type Week = 'this' | 'last';

function Row({ row, isMe }: { row: LeagueRow; isMe: boolean }) {
  const returnPct = row.returnPpm / PPM_PER_PERCENT;
  return (
    <View style={[styles.row, isMe && styles.me]}>
      <Text style={[styles.text, styles.rank]}>{row.rank}</Text>
      <View style={styles.player}>
        <Text style={[styles.text, styles.name, isMe && styles.bold]} numberOfLines={1}>
          {row.name.replace(BOT_SUFFIX, '')}
        </Text>
        {row.bot ? <Text style={styles.botTag}>bot</Text> : null}
      </View>
      <Text style={[styles.text, styles.cell, { color: changeColor(returnPct) }]}>
        {percent(returnPct)}
      </Text>
      <Text style={[styles.text, styles.cell]}>
        {(row.maxFallPpm / PPM_PER_PERCENT).toFixed(2)}%
      </Text>
      <Text style={[styles.text, styles.score, styles.bold]}>{row.score.toFixed(0)}</Text>
    </View>
  );
}

export default function LeagueScreen() {
  const { me } = useGame();
  const [week, setWeek] = useState<Week>('this');
  const [current, setCurrent] = useState<LeagueTable | null>(null);
  const [previous, setPrevious] = useState<LeagueTable | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        setCurrent(await api.league());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const lastWeekEnd = current?.previousWeekEndsAt ?? null;
  useEffect(() => {
    if (lastWeekEnd === null) return;
    api.finishedWeek(lastWeekEnd).then(setPrevious, () => setPrevious(null));
  }, [lastWeekEnd]);

  if (!current) {
    return (
      <View style={styles.page}>
        {failed ? (
          <Text style={styles.subtitle}>Can’t load the table right now.</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </View>
    );
  }

  const table = week === 'last' && previous ? previous : current;
  const onTable = table.rows.some((row) => row.id === me?.uid);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={table.rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => <Row row={item} isMe={item.id === me?.uid} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{week === 'last' ? 'Last week’s table' : 'This week’s table'}</Text>
          <Text style={styles.subtitle}>Score: 85% return rank, 15% stability rank.</Text>
          {previous ? (
            <View style={styles.weeks}>
              <Segments
                value={week}
                onChange={setWeek}
                options={[
                  { value: 'this', label: 'This week' },
                  { value: 'last', label: 'Last week' },
                ]}
              />
            </View>
          ) : null}
          {!onTable && week === 'this' ? (
            <Text style={styles.subtitle}>
              You’ll join the table once you hold a security this week. It updates at each market
              open and close.
            </Text>
          ) : null}
          <View style={styles.row}>
            <Text style={[styles.head, styles.rank]}>#</Text>
            <Text style={[styles.head, styles.flex]}>Player</Text>
            <Text style={[styles.head, styles.cell]}>Return</Text>
            <Text style={[styles.head, styles.cell]}>Max fall</Text>
            <Text style={[styles.head, styles.score]}>Score</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Text style={styles.empty}>The table starts at the next market open.</Text>
        </Card>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          {table.total > table.rows.length ? (
            <Text style={styles.empty}>
              Showing the top {table.rows.length} of {table.total} players.
            </Text>
          ) : null}
          <Link href="/admin" style={styles.link}>
            Clock admin
          </Link>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1, padding: 16 },
  list: { backgroundColor: colors.page, flex: 1 },
  content: { padding: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 12, marginTop: 2 },
  weeks: { marginBottom: 12 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  me: { backgroundColor: colors.brandSoft },
  head: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  text: { color: colors.ink, fontSize: 13, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
  rank: { width: 24 },
  flex: { flex: 1 },
  player: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4 },
  name: { flexShrink: 1 },
  botTag: { color: colors.muted, fontSize: 11 },
  cell: { textAlign: 'right', width: 62 },
  score: { textAlign: 'right', width: 40 },
  empty: { color: colors.muted, fontSize: 14 },
  footer: { gap: 12, marginTop: 16 },
  link: { color: colors.brand, fontSize: 14, fontWeight: '600' },
});
