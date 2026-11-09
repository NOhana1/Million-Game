// Everyone in the game, on the admin page: real players first, then the bots. It needs the clock
// code, like the clock controls, and shows no emails.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, ApiProblem, Roster, RosterPlayer, RosterRow } from '@/api/client';
import { toShekels } from '@/game/view';

import { DivisionBadge } from './division-badge';
import { Button, Card, colors, font, ils } from './ui';

const JOINED = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' });

const lastSeen = (player: RosterPlayer) => {
  if (player.activeToday) return 'Today';
  if (!player.lastDay) return 'Not since joining';
  return JOINED.format(new Date(`${player.lastDay}T12:00:00Z`));
};

const place = (row: RosterRow) =>
  row.rank ? `#${row.rank} · ${ils(Math.round(toShekels(row.value ?? 0)))}` : 'Not on this week’s table';

export function RosterCard({ code }: { code: string }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setProblem(null);
    try {
      setRoster(await api.roster(code.trim()));
    } catch (error) {
      const wrongCode = error instanceof ApiProblem && error.status === 401;
      setProblem(wrongCode ? 'That code isn’t right.' : 'Couldn’t load the players. Please try again.');
    }
    setLoading(false);
  };

  const active = roster?.players.filter((p) => p.activeToday).length ?? 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Players</Text>
      <Text style={styles.hint}>
        Everyone who signed up, and the bots, kept apart. Only someone with the clock code can see
        this. Emails aren’t shown.
      </Text>
      <Button
        variant="quiet"
        label={roster ? 'Refresh' : 'Show players'}
        onPress={load}
        disabled={loading || code.trim() === ''}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : null}

      {roster ? (
        <>
          <View style={styles.summary}>
            <Fact value={roster.players.length} label="signed up" />
            <Fact value={active} label="opened it today" />
            <Fact value={roster.bots.length} label="bots" />
          </View>

          <Text style={styles.section}>Real players</Text>
          {roster.players.length === 0 ? <Text style={styles.hint}>Nobody has signed up yet.</Text> : null}
          {roster.players.map((player) => (
            <View key={player.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {player.name}
                </Text>
                {player.activeToday ? <Text style={styles.live}>● Today</Text> : null}
                <DivisionBadge division={player.division} size={16} />
              </View>
              <Text style={styles.detail}>
                Joined {JOINED.format(player.joinedAt)} · Last opened {lastSeen(player)}
                {player.streakDays > 1 ? ` · ${player.streakDays} days in a row` : ''}
              </Text>
              <Text style={styles.detail}>
                {player.holdings === 1 ? '1 holding' : `${player.holdings} holdings`}
                {player.pendingOrders ? ` · ${player.pendingOrders} waiting to fill` : ''}
                {player.inGroup ? ' · In a group' : ''} · {place(player)}
              </Text>
            </View>
          ))}

          <Text style={styles.section}>Bots</Text>
          {roster.bots.map((bot) => (
            <View key={bot.id} style={styles.botRow}>
              <Text style={styles.botName} numberOfLines={1}>
                {bot.name.replace(/ \(bot\)$/, '')}
              </Text>
              <Text style={styles.detail}>{place(bot)}</Text>
              <DivisionBadge division={bot.division} size={14} />
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.detail}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  hint: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  summary: { flexDirection: 'row', gap: 8 },
  fact: { borderColor: colors.line, borderRadius: 3, borderWidth: 1, flex: 1, padding: 10 },
  factValue: { color: colors.ink, fontFamily: font.display, fontSize: 26, fontWeight: '500' },
  section: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  row: { borderTopColor: colors.line, borderTopWidth: 1, gap: 3, paddingTop: 10 },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { color: colors.ink, flexShrink: 1, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  live: { color: colors.up, fontFamily: font.body, fontSize: 12, fontWeight: '600' },
  detail: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  botRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  botName: { color: colors.ink, flex: 1, fontFamily: font.body, fontSize: 14 },
});
