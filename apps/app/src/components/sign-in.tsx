import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { signInProblem, usesAccounts } from '@/api/session';
import { useGame } from '@/game/store';

import { Button, Card, colors, Segments } from './ui';

type Mode = 'create' | 'signIn';

export function SignIn() {
  const { status, signUp, signIn, chooseName } = useGame();
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const onlyName = status === 'needsName';
  const showAccount = usesAccounts && !onlyName;
  const showName = onlyName || mode === 'create';

  const trimmed = name.trim();
  const accountReady = !showAccount || (email.trim() !== '' && password !== '');
  const nameReady = !showName || trimmed.length >= 2;
  const ready = accountReady && nameReady && !sending;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    setProblem(null);
    try {
      if (onlyName) await chooseName(trimmed);
      else if (mode === 'create') await signUp(email.trim(), password, trimmed);
      else await signIn(email.trim(), password);
    } catch (error) {
      setProblem(signInProblem(error));
      setSending(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.column}>
        <Text style={styles.brand}>Portfolio League</Text>
        <Text style={styles.lead}>
          Start with ₪1,000,000, trade Tel Aviv and US securities, and compete on the weekly table.
        </Text>
        <Card style={styles.card}>
          {showAccount ? (
            <>
              <Segments
                value={mode}
                onChange={(value) => {
                  setMode(value);
                  setProblem(null);
                }}
                options={[
                  { value: 'create', label: 'Create account' },
                  { value: 'signIn', label: 'Sign in' },
                ]}
              />
              <Text style={styles.label}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                onChangeText={setEmail}
                style={styles.input}
                value={email}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                onChangeText={setPassword}
                onSubmitEditing={submit}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </>
          ) : null}
          {showName ? (
            <>
              <Text style={styles.label}>Your player name</Text>
              <TextInput
                accessibilityLabel="Your player name"
                autoFocus={!showAccount}
                maxLength={24}
                onChangeText={setName}
                onSubmitEditing={submit}
                placeholder="For example, Noa"
                placeholderTextColor="#9AA39E"
                style={styles.input}
                value={name}
              />
            </>
          ) : null}
          {problem ? <Text style={styles.error}>{problem}</Text> : null}
          <Button
            label={showName ? 'Join the league' : 'Sign in'}
            onPress={submit}
            disabled={!ready}
          />
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
  error: { color: colors.down, fontSize: 14, fontWeight: '600' },
  input: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
});
