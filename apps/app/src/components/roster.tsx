// Everyone in the game, on the admin page: a switch shows the real players or the bots. The game
// makes the bots, so anyone else is a real player. It needs the clock code and shows no emails.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, ApiProblem, Roster } from '@/api/client';

import { Button, Card, colors, font, Segments } from './ui';

export function RosterCard({ code }: { code: string }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [list, setList] = useState<'players' | 'bots'>('players');

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

  const bots = list === 'bots';
  const rows = roster ? (bots ? roster.bots : roster.players) : [];

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Players</Text>
      <Text style={styles.hint}>Who’s a real player and who’s a bot. Needs the clock code. No emails.</Text>
      <Button
        variant="quiet"
        label={roster ? 'Refresh' : 'Show players'}
        onPress={load}
        disabled={loading || code.trim() === ''}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : null}

      {roster ? (
        <>
          {/* One list at a time: real players or bots, never mixed. */}
          <Segments
            value={list}
            onChange={setList}
            options={[
              { value: 'players', label: `Real players · ${roster.players.length}` },
              { value: 'bots', label: `Bots · ${roster.bots.length}` },
            ]}
          />
          <Text style={styles.hint}>
            {bots
              ? 'The game made these so the table is never empty.'
              : 'Everyone who signed up. Anyone the game didn’t make is a real player.'}
          </Text>
          {rows.length === 0 ? (
            <Text style={styles.hint}>
              {bots ? 'The bots arrive at the next market open.' : 'Nobody has signed up yet.'}
            </Text>
          ) : null}
          {rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {row.name.replace(/ \(bot\)$/, '')}
              </Text>
              <Text style={[styles.tag, bots && styles.botTag]}>{bots ? 'Bot' : 'Real player'}</Text>
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  hint: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  row: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },
  name: { color: colors.ink, flex: 1, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  tag: { color: colors.up, fontFamily: font.body, fontSize: 12, fontWeight: '600' },
  botTag: { color: colors.muted },
});
