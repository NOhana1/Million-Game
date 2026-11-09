import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { api, ApiProblem, ClockChange, ClockResult } from '@/api/client';
import {
  Button,
  Card,
  changeColorOnDeep,
  colors,
  Field,
  font,
  Hero,
  Page,
  Segments,
} from '@/components/ui';
import { RosterCard } from '@/components/roster';
import { useGame, useLiveWorldTime } from '@/game/store';
import { formatClock, formatDay, formatWorldTime, MARKET_LABEL, nextEvent } from '@/game/view';

const SPEEDS = [
  { value: '1', label: 'Real time' },
  { value: '7', label: 'Normal 7×' },
  { value: '30', label: 'Fast 30×' },
  { value: '60', label: 'Fastest 60×' },
];
const MAX_LOG = 5;

const fillText = ({ settlement: { filled, status } }: ClockResult) => {
  const orders = filled === 1 ? '1 order filled' : `${filled} orders filled`;
  return status === 'finished' || status === 'idle' ? orders : `${orders}, more on the way`;
};

// The clock is shared by every player, so moving it needs the secret clock code. The code stays
// in memory on this screen and is never saved. The server makes the real check.
export default function AdminScreen() {
  const { world, clockMoved } = useGame();
  const time = useLiveWorldTime();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  if (!world) return null;

  const move = async (change: ClockChange, describe: (result: ClockResult) => string) => {
    setSending(true);
    setProblem(null);
    try {
      const result = await api.moveClock(code.trim(), change);
      setLog((lines) => [describe(result), ...lines].slice(0, MAX_LOG));
      await clockMoved();
    } catch (error) {
      const wrongCode = error instanceof ApiProblem && error.status === 401;
      setProblem(wrongCode ? 'That code isn’t right.' : 'Couldn’t move the clock. Please try again.');
    }
    setSending(false);
  };

  const { paused, speed, tradingPaused } = world.clock;
  const next = nextEvent(world);
  const disabled = sending || code.trim() === '';

  const jump = () =>
    move({ action: 'advance', to: 'next' }, (result) =>
      `${formatWorldTime(time)} → ${formatWorldTime(result.worldTime)}. ${next.text}. ${fillText(result)}.`,
    );

  const pauseOrPlay = () =>
    paused
      ? move({ action: 'resume' }, () => `Time is moving again from ${formatWorldTime(time)}.`)
      : move({ action: 'pause' }, () => `Time stopped at ${formatWorldTime(time)}.`);

  const switchTrading = () =>
    tradingPaused
      ? move({ action: 'trading', open: true }, () => 'Trading is open again.')
      : move({ action: 'trading', open: false }, () =>
          'Trading is paused. New orders are refused; prices, fills and the table go on.',
        );

  const changeSpeed = (value: string) =>
    move({ action: 'speed', speed: Number(value) }, () =>
      value === '1' ? 'Time now moves at real speed.' : `Time now moves ${value}× faster.`,
    );

  return (
    <Page maxWidth={560}>
      <Hero style={styles.clock}>
        <Text style={styles.day}>{formatDay(time)}</Text>
        <Text style={styles.time}>{formatClock(time)}</Text>
        <Text style={[styles.state, { color: changeColorOnDeep(paused ? -1 : 1) }]}>
          {paused ? 'Stopped' : `Moving, ${speed}× real speed`}
        </Text>
        <Text style={styles.day}>
          {MARKET_LABEL.TASE} {world.markets.TASE.open ? 'open' : 'closed'} · {MARKET_LABEL.US}{' '}
          {world.markets.US.open ? 'open' : 'closed'}
        </Text>
      </Hero>
      <Text style={styles.subtitle}>Every player shares this clock. Changes here move it for everyone.</Text>

      <Card style={styles.card}>
        <Field
          label="Clock code"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setCode}
          placeholder="Enter the code to use the controls"
          secureTextEntry
          value={code}
        />
        <Button
          label={`Jump to ${formatWorldTime(next.at)}: ${next.text}`}
          onPress={jump}
          disabled={disabled}
        />
        <Button
          variant="quiet"
          label={paused ? 'Start time' : 'Stop time'}
          onPress={pauseOrPlay}
          disabled={disabled}
        />
        <Text style={styles.label}>Emergency brake</Text>
        <Text style={styles.hint}>
          {tradingPaused
            ? 'Trading is paused. Players see a notice and can’t place orders.'
            : 'Stops new orders for everyone, without stopping time. Use it if something looks wrong.'}
        </Text>
        <Button
          variant={tradingPaused ? 'solid' : 'quiet'}
          label={tradingPaused ? 'Open trading again' : 'Pause trading'}
          onPress={switchTrading}
          disabled={disabled}
        />
        <Text style={styles.label}>Speed</Text>
        <Segments
          value={String(speed)}
          onChange={changeSpeed}
          options={SPEEDS}
          disabled={disabled}
        />
        {problem ? <Text style={styles.error}>{problem}</Text> : null}
      </Card>

      {log.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.label}>What just happened</Text>
          {log.map((line, index) => (
            <Text key={`${index}-${line}`} style={index === 0 ? styles.latest : styles.older}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      <RosterCard code={code} />
    </Page>
  );
}

const styles = StyleSheet.create({
  clock: { alignItems: 'center', gap: 2, paddingVertical: 24 },
  day: { color: colors.onDeep, fontFamily: font.body, fontSize: 15 },
  time: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 84,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 96,
  },
  state: { fontFamily: font.body, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  subtitle: { color: colors.muted, fontFamily: font.body, fontSize: 14, textAlign: 'center' },
  card: { gap: 12 },
  label: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  latest: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  older: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
