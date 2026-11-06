import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { signInProblem, usesAccounts } from '@/api/session';
import { useGame } from '@/game/store';

import { Button, Card, colors, Field, font, Segments, Tile, useWide } from './ui';

const SAMPLE_TILES = [
  { name: 'Tel Aviv', sector: 'Fund' },
  { name: 'Sharon Bank', sector: 'Banks' },
  { name: 'Negev Solar', sector: 'Energy' },
  { name: 'Arava Pharma', sector: 'Health' },
  { name: 'HaGalil Foods', sector: 'Consumer' },
];

type Mode = 'create' | 'signIn';

export function SignIn() {
  const { status, signUp, signIn, chooseName } = useGame();
  const wide = useWide();
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
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.intro, wide && styles.half]}>
          <Text style={styles.brand}>Portfolio League</Text>
          <Text style={styles.money}>₪1,000,000</Text>
          <Text style={styles.lead}>
            Virtual money, real competition. Trade Tel Aviv and US securities and climb the weekly
            table.
          </Text>
          <View style={styles.tiles}>
            {SAMPLE_TILES.map((tile) => (
              <Tile key={tile.name} {...tile} />
            ))}
          </View>
        </View>

        <Card style={[styles.card, wide && styles.half]}>
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
              <Field
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                onChangeText={setEmail}
                value={email}
              />
              <Field
                label="Password"
                autoCapitalize="none"
                onChangeText={setPassword}
                onSubmitEditing={submit}
                secureTextEntry
                value={password}
              />
            </>
          ) : null}
          {showName ? (
            <Field
              label="Your player name"
              autoFocus={!showAccount}
              maxLength={24}
              onChangeText={setName}
              onSubmitEditing={submit}
              placeholder="For example, Noa"
              value={name}
            />
          ) : null}
          {problem ? <Text style={styles.error}>{problem}</Text> : null}
          <Button
            label={showName ? 'Join the league' : 'Sign in'}
            onPress={submit}
            disabled={!ready}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.plum, flex: 1 },
  content: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 20 },
  layout: { gap: 24, maxWidth: 420, width: '100%' },
  layoutWide: { alignItems: 'center', flexDirection: 'row', gap: 56, maxWidth: 920 },
  half: { flex: 1 },
  intro: { gap: 8, width: '100%' },
  brand: { color: colors.sun, fontFamily: font.display, fontSize: 24, fontWeight: '700' },
  money: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 58,
    fontWeight: '600',
    lineHeight: 66,
  },
  lead: { color: colors.onPlum, fontFamily: font.body, fontSize: 17, lineHeight: 25 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  card: { borderRadius: 28, gap: 14, padding: 20, width: '100%' },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
