import { DIVISIONS } from '@portfolio-league/engine';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { api } from '@/api/client';
import { resendConfirmation, resetPassword, signedInEmail, signInProblem, usesAccounts } from '@/api/session';
import { useGame } from '@/game/store';

import { Brand } from './world-bar';
import { DivisionTag } from './division-badge';
import { Spark } from './spark';
import { Button, Card, colors, Field, font, hover, PasswordField, Segments, useWide } from './ui';

type Mode = 'create' | 'signIn' | 'reset';

const SHOWCASE_FUND = 'TAIX';
const SHOWCASE_HEIGHT = 90;

// \p{L} is a letter in any language, so Hebrew passwords count too.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', met: (password: string) => password.length >= 8 },
  { label: 'At least one letter', met: (password: string) => /\p{L}/u.test(password) },
  { label: 'At least one number', met: (password: string) => /\d/.test(password) },
];

export function SignIn() {
  const { status, signUp, signIn, chooseName, lookAround, checkEmail, signOut } = useGame();
  const wide = useWide();
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [line, setLine] = useState<number[]>();
  useEffect(() => {
    api
      .history(SHOWCASE_FUND, 'ALL')
      .then((history) => setLine(history.points.map((point) => point.price)))
      .catch(() => undefined);
  }, []);

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
          <Brand />
          {/* One sentence instead of a label over a giant number: the heading says it itself. */}
          <Text style={[styles.headline, !wide && styles.headlinePhone]}>
            Start with <Text style={styles.money}>₪1,000,000</Text>
          </Text>
          <View style={styles.chart}>
            <Spark prices={line} width={wide ? 420 : 320} height={SHOWCASE_HEIGHT} color={colors.brand} />
            <Text style={styles.chartNote}>The game’s Tel Aviv index fund, since the game began</Text>
          </View>
          <Text style={styles.lead}>
            Virtual money, real competition. Trade Tel Aviv and US securities and climb the weekly table.
          </Text>
          <View style={styles.badges}>
            {DIVISIONS.map((division) => (
              <DivisionTag key={division} onDark division={division} size={26} />
            ))}
          </View>
        </View>

        {status === 'needsEmail' ? (
          <ConfirmEmail check={checkEmail} other={signOut} style={[styles.card, wide && styles.half]} />
        ) : (
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
                  <PasswordField
                    label="Password"
                    autoCapitalize="none"
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                    onChangeText={setPassword}
                    onSubmitEditing={submit}
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
                    <PasswordField
                      label="Repeat password"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      onChangeText={setRepeat}
                      onSubmitEditing={submit}
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
                {...hover('link')}
                style={styles.link}>
                <Text style={styles.linkText}>
                  {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
                </Text>
              </Pressable>
            ) : null}
            {onlyName ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={lookAround}
                {...hover('link')}
                style={styles.lookAround}>
                <Text style={styles.lookAroundText}>Look around first →</Text>
                <Text style={styles.lookAroundHint}>
                  See the market, the league table and the rules. No account needed.
                </Text>
              </Pressable>
            )}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

/** After sign-up: the account waits until its owner clicks the link we emailed. */
function ConfirmEmail({
  check,
  other,
  style,
}: {
  check: () => Promise<boolean>;
  other: () => Promise<void>;
  style: StyleProp<ViewStyle>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const confirmed = async () => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      if (!(await check())) setProblem('Not confirmed yet. Click the link in the email, then try again.');
    } catch (error) {
      setProblem(signInProblem(error));
    }
    setBusy(false);
  };

  const resend = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await resendConfirmation();
      setNotice('Sent again. Check spam too.');
    } catch (error) {
      setProblem(signInProblem(error));
    }
    setBusy(false);
  };

  return (
    <Card style={style}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.lead}>
        We sent a link to <Text style={styles.strong}>{signedInEmail() ?? 'your email'}</Text>. Click it to
        confirm the address is yours, and you’ll join the league. This page moves on by itself. Check spam
        too.
      </Text>
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button label="I’ve clicked the link" onPress={confirmed} disabled={busy} />
      <Button variant="quiet" label="Send the link again" onPress={resend} disabled={busy} />
      <Pressable accessibilityRole="button" onPress={other} {...hover('link')} style={styles.link}>
        <Text style={styles.linkText}>Use a different email</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.deep, flex: 1 },
  content: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 20 },
  layout: { gap: 28, maxWidth: 420, width: '100%' },
  layoutWide: { alignItems: 'center', flexDirection: 'row', gap: 72, maxWidth: 960 },
  half: { flex: 1 },
  intro: { gap: 10, width: '100%' },
  headline: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 44,
    fontWeight: '400',
    lineHeight: 52,
    marginTop: 22,
  },
  headlinePhone: { fontSize: 34, lineHeight: 41 },
  money: { color: colors.brand, fontVariant: ['tabular-nums'] },
  chart: { gap: 6, marginBottom: 6 },
  chartNote: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  lead: { color: colors.onDeep, fontFamily: font.body, fontSize: 17, lineHeight: 26 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 14 },
  card: { gap: 14, padding: 28, width: '100%' },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  strong: { color: colors.ink, fontWeight: '600' },
  rules: { gap: 4 },
  rule: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  ruleMet: { color: colors.up, fontWeight: '600' },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  notice: { color: colors.up, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 4 },
  lookAround: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 3,
    marginTop: 4,
    paddingTop: 14,
  },
  lookAroundText: { color: colors.brand, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  lookAroundHint: { color: colors.muted, fontFamily: font.body, fontSize: 12, textAlign: 'center' },
  linkText: { color: colors.muted, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
});
