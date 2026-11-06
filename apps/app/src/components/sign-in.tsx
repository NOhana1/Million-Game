import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { resetPassword, signInProblem, usesAccounts } from '@/api/session';
import { useGame } from '@/game/store';

import { Button, Card, colors, Field, font, Segments, Tile, useWide } from './ui';

const SAMPLE_TILES = [
  { name: 'Tel Aviv', sector: 'Fund' },
  { name: 'Sharon Bank', sector: 'Banks' },
  { name: 'Negev Solar', sector: 'Energy' },
  { name: 'Arava Pharma', sector: 'Health' },
  { name: 'HaGalil Foods', sector: 'Consumer' },
];

type Mode = 'create' | 'signIn' | 'reset';

// \p{L} is a letter in any language, so Hebrew passwords count too.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', met: (password: string) => password.length >= 8 },
  { label: 'At least one letter', met: (password: string) => /\p{L}/u.test(password) },
  { label: 'At least one number', met: (password: string) => /\d/.test(password) },
];

export function SignIn() {
  const { status, signUp, signIn, chooseName } = useGame();
  const wide = useWide();
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onlyName = status === 'needsName';
  const showAccount = usesAccounts && !onlyName;
  const showName = onlyName || mode === 'create';

  const trimmed = name.trim();
  const passwordReady =
    mode === 'reset' ||
    (mode === 'signIn' && password !== '') ||
    (PASSWORD_RULES.every((rule) => rule.met(password)) && password === repeat);
  const accountReady = !showAccount || (email.trim() !== '' && passwordReady);
  const nameReady = !showName || trimmed.length >= 2;
  const ready = accountReady && nameReady && !sending;

  const changeMode = (value: Mode) => {
    setMode(value);
    setProblem(null);
    setNotice(null);
  };

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    setProblem(null);
    setNotice(null);
    try {
      if (onlyName) await chooseName(trimmed);
      else if (mode === 'reset') {
        await resetPassword(email.trim());
        setNotice('If that email has an account, a reset link is on its way. Check spam too.');
        setSending(false);
      } else if (mode === 'create') await signUp(email.trim(), password, trimmed);
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
              {mode === 'reset' ? (
                <Text style={styles.title}>Reset your password</Text>
              ) : (
                <Segments
                  value={mode}
                  onChange={changeMode}
                  options={[
                    { value: 'create', label: 'Create account' },
                    { value: 'signIn', label: 'Sign in' },
                  ]}
                />
              )}
              <Field
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                onChangeText={setEmail}
                onSubmitEditing={submit}
                value={email}
              />
              {mode === 'reset' ? null : (
                <Field
                  label="Password"
                  autoCapitalize="none"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  onChangeText={setPassword}
                  onSubmitEditing={submit}
                  secureTextEntry
                  value={password}
                />
              )}
              {mode === 'create' ? (
                <>
                  <View style={styles.rules}>
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.met(password);
                      return (
                        <Text key={rule.label} style={[styles.rule, met && styles.ruleMet]}>
                          {met ? '✓' : '○'} {rule.label}
                        </Text>
                      );
                    })}
                  </View>
                  <Field
                    label="Repeat password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setRepeat}
                    onSubmitEditing={submit}
                    secureTextEntry
                    value={repeat}
                  />
                  {repeat !== '' && repeat !== password ? (
                    <Text style={styles.error}>The two passwords don’t match.</Text>
                  ) : null}
                </>
              ) : null}
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
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button
            label={showName ? 'Join the league' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
            onPress={submit}
            disabled={!ready}
          />
          {showAccount && mode !== 'create' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => changeMode(mode === 'reset' ? 'signIn' : 'reset')}
              style={styles.link}>
              <Text style={styles.linkText}>
                {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
              </Text>
            </Pressable>
          ) : null}
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
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '600' },
  rules: { gap: 4 },
  rule: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  ruleMet: { color: colors.up, fontWeight: '600' },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  notice: { color: colors.up, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 4 },
  linkText: { color: colors.brand, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
});
