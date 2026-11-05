import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiProblem, ClockChange } from '@/api/client';
import { Button, Card, colors } from '@/components/ui';
import { useGame } from '@/game/store';
import { formatWorldTime } from '@/game/view';

// The clock is shared by every player, so moving it needs the secret clock code. The code stays
// in memory on this screen and is never saved. The server makes the real check.
export default function AdminScreen() {
  const { refresh } = useGame();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const move = async (change: ClockChange) => {
    setSending(true);
    setMessage(null);
    setProblem(null);
    try {
      const { worldTime, clock } = await api.moveClock(code.trim(), change);
      setMessage(`Clock is at ${formatWorldTime(worldTime)}${clock.paused ? ', paused' : ''}.`);
      await refresh();
    } catch (error) {
      const wrongCode = error instanceof ApiProblem && error.status === 401;
      setProblem(wrongCode ? 'That code isn’t right.' : 'Couldn’t move the clock. Please try again.');
    }
    setSending(false);
  };

  const disabled = sending || code.trim() === '';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Clock admin</Text>
      <Text style={styles.subtitle}>
        All players share one clock, so these controls move it for everyone.
      </Text>
      <Card style={styles.card}>
        <Text style={styles.label}>Clock code</Text>
        <TextInput
          accessibilityLabel="Clock code"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setCode}
          secureTextEntry
          style={styles.input}
          value={code}
        />
        <Button
          label="Next open/close"
          onPress={() => move({ action: 'advance', to: 'next' })}
          disabled={disabled}
        />
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button
              variant="quiet"
              label="Pause"
              onPress={() => move({ action: 'pause' })}
              disabled={disabled}
            />
          </View>
          <View style={styles.flex}>
            <Button
              variant="quiet"
              label="Resume"
              onPress={() => move({ action: 'resume' })}
              disabled={disabled}
            />
          </View>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {problem ? <Text style={styles.error}>{problem}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  content: { padding: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 12, marginTop: 2 },
  card: { gap: 12 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  message: { color: colors.up, fontSize: 14, fontWeight: '600' },
  error: { color: colors.down, fontSize: 14, fontWeight: '600' },
});
