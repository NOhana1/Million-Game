import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, changeColor, colors, percent } from '@/components/ui';
import { leagueTable } from '@/game/sim';
import { useGame } from '@/game/store';

export default function LeagueScreen() {
  const { state } = useGame();
  const rows = leagueTable(state);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>This week’s table</Text>
      <Text style={styles.subtitle}>Score: 85% return rank, 15% stability rank.</Text>
      {rows.some((row) => row.isMe) ? null : (
        <Text style={styles.subtitle}>You’ll join the table once you hold a security this week.</Text>
      )}
      <Card style={styles.table}>
        <View style={styles.row}>
          <Text style={[styles.head, styles.rank]}>#</Text>
          <Text style={[styles.head, styles.flex]}>Player</Text>
          <Text style={[styles.head, styles.cell]}>Return</Text>
          <Text style={[styles.head, styles.cell]}>Max fall</Text>
          <Text style={[styles.head, styles.score]}>Score</Text>
        </View>
        {rows.map((row, i) => (
          <View key={row.name} style={[styles.row, row.isMe && styles.me]}>
            <Text style={[styles.text, styles.rank]}>{i + 1}</Text>
            <Text style={[styles.text, styles.flex, row.isMe && styles.bold]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.text, styles.cell, { color: changeColor(row.returnPct) }]}>
              {percent(row.returnPct)}
            </Text>
            <Text style={[styles.text, styles.cell]}>{row.maxFallPct.toFixed(2)}%</Text>
            <Text style={[styles.text, styles.score, styles.bold]}>{row.score.toFixed(0)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  content: { padding: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 12, marginTop: 2 },
  table: { padding: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 10 },
  me: { backgroundColor: colors.brandSoft },
  head: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  text: { color: colors.ink, fontSize: 13, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
  rank: { width: 18 },
  flex: { flex: 1 },
  cell: { textAlign: 'right', width: 62 },
  score: { textAlign: 'right', width: 40 },
});
