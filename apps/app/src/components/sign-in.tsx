import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useGame } from '@/game/store';

import { Button, Card, colors } from './ui';

export function SignIn() {
  const { dispatch } = useGame();
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const join = () => {
    if (trimmed) dispatch({ type: 'join', name: trimmed });
  };

  return (
    <View style={styles.page}>
      <View style={styles.column}>
        <Text style={styles.brand}>Portfolio League</Text>
        <Text style={styles.lead}>
          Start with ₪1,000,000, trade Tel Aviv and US securities, and compete on the weekly table.
        </Text>
        <Card style={styles.card}>
          <Text style={styles.label}>Your player name</Text>
          <TextInput
            accessibilityLabel="Your player name"
            autoFocus
            onChangeText={setName}
            onSubmitEditing={join}
            placeholder="For example, Noa"
            placeholderTextColor="#9AA39E"
            style={styles.input}
            value={name}
          />
          <Button label="Join the league" onPress={join} disabled={!trimmed} />
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: colors.page,
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  column: { gap: 12, maxWidth: 420, width: '100%' },
  brand: { color: colors.brand, fontSize: 32, fontWeight: '800' },
  lead: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: { gap: 12, marginTop: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
});
