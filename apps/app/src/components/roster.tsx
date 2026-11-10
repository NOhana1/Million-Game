// Everyone in the game, on the admin page: a switch shows the real players or the bots. The game
// makes the bots, so anyone else is a real player. It needs the admin code and shows no emails.
// A real player can be deleted from here, which also frees their email to sign up again. Bots can
// be added with the plus button, or deleted.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiProblem, Roster, RosterRow } from '@/api/client';

import { Confirm } from './confirm';
import { Button, Card, colors, font, Segments } from './ui';

const shown = (name: string) => name.replace(/ \(bot\)$/, '');

export function RosterCard({ code }: { code: string }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [list, setList] = useState<'players' | 'bots'>('players');
  const [deleting, setDeleting] = useState<(RosterRow & { bot: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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

  const failed = (error: unknown, what: string) => {
    const status = error instanceof ApiProblem ? error.status : 0;
    setProblem(
      status === 401
        ? 'That code isn’t right.'
        : status === 409
          ? 'The league is updating. Try again in a minute.'
          : `Couldn’t ${what}. Please try again.`,
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { id, bot } = deleting;
    const name = shown(deleting.name);
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      if (bot) await api.deleteBot(code.trim(), id);
      else await api.deletePlayer(code.trim(), id);
      setDone(bot ? `${name} was deleted.` : `${name} was deleted. Their email can sign up again.`);
      setRoster((before) =>
        before
          ? {
              players: before.players.filter((p) => p.id !== id),
              bots: before.bots.filter((b) => b.id !== id),
            }
          : before,
      );
    } catch (error) {
      failed(error, `delete ${name}`);
    }
    setDeleting(null);
    setBusy(false);
  };

  const addBot = async () => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      const { bot } = await api.addBot(code.trim());
      setDone(`${shown(bot.name)} joined. It buys now, and shows on the table after the next market open or close.`);
      setRoster((before) =>
        before ? { ...before, bots: [...before.bots, bot].sort((a, b) => a.name.localeCompare(b.name)) } : before,
      );
    } catch (error) {
      failed(error, 'add a bot');
    }
    setBusy(false);
  };

  const bots = list === 'bots';
  const rows = roster ? (bots ? roster.bots : roster.players) : [];

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Players</Text>
      <Text style={styles.hint}>Who’s a real player and who’s a bot. Needs the admin code. No emails.</Text>
      <Button
        variant="quiet"
        label={roster ? 'Refresh' : 'Show players'}
        onPress={load}
        disabled={loading || code.trim() === ''}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
      {done ? <Text style={styles.done}>{done}</Text> : null}

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
          {bots ? <Button label="+ Add bot" onPress={addBot} disabled={busy} /> : null}
          <Text style={styles.hint}>
            {bots
              ? 'The game made these so the table is never empty. A new bot gets a random style, division and picks.'
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
                {shown(row.name)}
              </Text>
              <Text style={[styles.tag, bots && styles.botTag]}>{bots ? 'Bot' : 'Real player'}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${shown(row.name)}`}
                disabled={busy}
                hitSlop={8}
                onPress={() => setDeleting({ ...row, bot: bots })}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}

      {deleting ? (
        <Confirm
          title={`Delete ${shown(deleting.name)}?`}
          text={
            deleting.bot
              ? 'This removes the bot from the league and the table. Past weeks keep its results. This can’t be undone.'
              : 'This removes them from the game for good: their portfolio, orders, photo, group spot and place on the table, and their sign-in. Their email can then sign up again as a new player. This can’t be undone.'
          }
          yes={deleting.bot ? 'Delete bot' : 'Delete player'}
          busy={busy}
          onYes={confirmDelete}
          onNo={() => setDeleting(null)}
        />
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
  delete: { color: colors.down, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  done: { color: colors.up, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
