import { StyleSheet, Text, View } from 'react-native';

import { Card, colors } from '@/components/ui';

// Waiting for the API to publish the weekly table.
export default function LeagueScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>This week’s table</Text>
      <Text style={styles.subtitle}>Score: 85% return rank, 15% stability rank.</Text>
      <Card>
        <Text style={styles.subtitle}>The table will appear here soon.</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1, padding: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 12, marginTop: 2 },
});
