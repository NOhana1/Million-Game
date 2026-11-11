import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';

import { Button, Card, colors, font } from './ui';

const SEEN_KEY = 'portfolio-league-welcomed';

export const FIRST_STEPS = [
  {
    title: 'Buy',
    text: 'You start with ₪1,000,000 of virtual money. Pick a stock or fund on the Market page and choose an amount in shekels.',
  },
  {
    title: 'Wait for the fill',
    text: 'Orders don’t fill right away. If the market is open, you get today’s closing price. If it’s closed, you get the next opening price.',
  },
  {
    title: 'Climb the divisions',
    text: 'Hold a security and you’re on the weekly table. Finish in the top 25% of your division to move up, from Bronze to Diamond.',
  },
];

// Remembered per player, so a second account on the same phone still gets its welcome. Only a
// convenience: if the browser blocks storage, a new player just sees this again.
const alreadySeen = (uid: string) => {
  try {
    return globalThis.localStorage?.getItem(`${SEEN_KEY}-${uid}`) === 'yes';
  } catch {
    return false;
  }
};

const remember = (uid: string) => {
  try {
    globalThis.localStorage?.setItem(`${SEEN_KEY}-${uid}`, 'yes');
  } catch {
    // Nothing to do. See alreadySeen.
  }
};

export function Steps() {
  return (
    <View style={styles.steps}>
      {FIRST_STEPS.map(({ title, text }, index) => (
        <View key={title} style={styles.step}>
          <Text style={styles.number}>{index + 1}</Text>
          <View style={styles.stepText}>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.text}>{text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Shown once, to a player who hasn't traded yet. Players who already trade don't need it. */
export function Welcome() {
  const { me, orders } = useGame();
  const [closedFor, setClosedFor] = useState<string | null>(null);
  if (!me || closedFor === me.uid || alreadySeen(me.uid) || me.positions.length > 0 || orders.length > 0) {
    return null;
  }

  const close = () => {
    remember(me.uid);
    setClosedFor(me.uid);
  };

  const readRules = () => {
    close();
    router.push('/guide');
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <Text style={styles.title}>Welcome to Bull Run</Text>
          <Steps />
          <Button label="Start playing" onPress={close} />
          <Button label="Read the full rules" variant="quiet" onPress={readRules} />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: { gap: 14, maxWidth: 480, width: '100%' },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 28, fontWeight: '500' },
  steps: { gap: 14 },
  step: { flexDirection: 'row', gap: 14 },
  number: {
    color: colors.brand,
    fontFamily: font.display,
    fontSize: 24,
    fontWeight: '500',
    lineHeight: 28,
    width: 18,
  },
  stepText: { flex: 1, gap: 2, minWidth: 0 },
  stepTitle: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  text: { color: colors.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
});
