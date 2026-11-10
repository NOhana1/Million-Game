// The first thing on the Market each day: your streak of days in a row, and a tip.

import { StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';
import { tipOfTheDay } from '@/game/tips';

import { LineIcon } from './line-icon';
import { Card, colors, font } from './ui';

export function TodayCard() {
  const { me, market } = useGame();
  if (!market) return null;
  const tip = tipOfTheDay(me, market);
  const streak = me?.streak;

  return (
    <Card ruled style={styles.card}>
      {streak ? (
        <View style={styles.streak}>
          <LineIcon name="flame" size={34} />
          <View style={styles.flex}>
            <Text style={styles.days}>
              {streak.days === 1 ? 'Day 1' : `${streak.days} days in a row`}
            </Text>
            <Text style={styles.meta}>
              {streak.days === 1
                ? 'Come back tomorrow to start a streak.'
                : `Come back tomorrow to make it ${streak.days + 1}.`}
              {streak.best > streak.days ? ` Your best is ${streak.best}.` : ''}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.tip, streak ? styles.tipRuled : null]}>
        <Text style={styles.tipTitle}>{tip.personal ? 'A tip for your portfolio' : 'Tip of the day'}</Text>
        <Text style={styles.tipText}>{tip.text}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  streak: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  flex: { flex: 1, gap: 2 },
  days: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  tip: { gap: 6 },
  tipTitle: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  tipRuled: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 14 },
  tipText: { color: colors.ink, fontFamily: font.body, fontSize: 15, lineHeight: 23 },
});
