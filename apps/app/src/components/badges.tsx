// Small awards on a profile. League badges come from finished weeks, so everyone can see them.
// The first trade and the streak are only known to the player, so they show on your own page.
// Your own page also shows the ones still to earn, as goals.

import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/api/client';

import { colors, font } from './ui';

const STREAK_GOAL = 7;

type Badge = { icon: string; name: string; how: string; times: number };

/** Your own facts the server doesn't share: whether you've traded and your best streak. */
export type OwnFacts = { traded: boolean; bestStreak: number };

export function badgesOf(honours: Profile['honours'], own?: OwnFacts): Badge[] {
  const league: Badge[] = [
    { icon: '🌱', name: 'First week', how: 'Finish a week in the league', times: honours.weeksPlayed },
    { icon: '📈', name: 'Beat the market', how: 'Beat every index fund in a week', times: honours.beatMarket ?? 0 },
    { icon: '⬆️', name: 'Moved up', how: 'Move up a division', times: honours.movedUp ?? 0 },
    { icon: '🥉', name: 'Top 3', how: 'Finish a week in the top 3', times: honours.top3 },
    { icon: '🏆', name: 'Winner', how: 'Win a week', times: honours.wins },
  ];
  if (!own) return league;
  return [
    { icon: '🛒', name: 'First trade', how: 'Place your first order', times: own.traded ? 1 : 0 },
    ...league,
    {
      icon: '🔥',
      name: `${STREAK_GOAL} days in a row`,
      how: `Open the game ${STREAK_GOAL} days in a row`,
      times: own.bestStreak >= STREAK_GOAL ? 1 : 0,
    },
  ];
}

export function Badges({ honours, own }: { honours: Profile['honours']; own?: OwnFacts }) {
  const all = badgesOf(honours, own);
  // Someone else's page shows only what they've earned. Yours shows the rest too, faded.
  const shown = own ? all : all.filter((badge) => badge.times > 0);
  if (shown.length === 0) return <Text style={styles.empty}>No badges yet.</Text>;

  return (
    <View style={styles.list}>
      {shown.map((badge) => {
        const earned = badge.times > 0;
        return (
          <View key={badge.name} style={[styles.badge, earned ? styles.earned : styles.locked]}>
            <Text style={[styles.icon, !earned && styles.faded]}>{badge.icon}</Text>
            <View style={styles.text}>
              <Text style={[styles.name, !earned && styles.lockedText]}>
                {badge.name}
                {badge.times > 1 ? ` ×${badge.times}` : ''}
              </Text>
              <Text style={styles.how}>{earned ? 'Earned' : badge.how}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: 200,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  earned: { backgroundColor: colors.raised, borderColor: colors.brand },
  locked: { borderColor: colors.line, borderStyle: 'dashed' },
  icon: { fontSize: 26 },
  faded: { opacity: 0.3 },
  text: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  lockedText: { color: colors.muted },
  how: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 15 },
});
