import { shekelsToAgorot } from '@portfolio-league/engine';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, font, ils } from '@/components/ui';
import { useGame } from '@/game/store';
import { goalProgress, toShekels } from '@/game/view';

const MAX_GOAL_SHEKELS = 1_000_000_000;

function GoalEditor({ current, onClose }: { current?: number; onClose: () => void }) {
  const { setGoal } = useGame();
  const [text, setText] = useState(current ? String(toShekels(current)) : '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const amount = Number(text);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await setGoal(shekelsToAgorot(amount));
      onClose();
    } catch {
      setProblem('Couldn’t save your goal. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.editor}>
          <Text style={styles.title}>Your long-term goal</Text>
          <Text style={styles.help}>What should your portfolio be worth one day?</Text>
          <Field
            label="Goal in shekels"
            inputMode="numeric"
            placeholder="2000000"
            value={text}
            onChangeText={(value) => setText(value.replace(/\D/g, ''))}
          />
          {amount > MAX_GOAL_SHEKELS ? (
            <Text style={styles.problem}>The largest goal is {ils(MAX_GOAL_SHEKELS)}.</Text>
          ) : null}
          {problem ? <Text style={styles.problem}>{problem}</Text> : null}
          <Button
            label={saving ? 'Saving…' : 'Save goal'}
            onPress={save}
            disabled={saving || amount <= 0 || amount > MAX_GOAL_SHEKELS}
          />
          <Button label="Cancel" variant="quiet" onPress={onClose} />
        </Card>
      </View>
    </Modal>
  );
}

/** Lives in the cash panel, so the goal stays in view. */
export function GoalBar() {
  const { me } = useGame();
  const [editing, setEditing] = useState(false);
  if (!me) return null;

  const { goal } = me;
  const left = goal ? toShekels(goal - me.value) : 0;
  const progress = goal ? goalProgress(me.value, goal) : 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={goal ? 'Change your goal' : 'Set your goal'}
        onPress={() => setEditing(true)}
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
        {goal ? (
          <>
            <View style={styles.line}>
              <Text style={styles.strong}>Goal {ils(toShekels(goal))}</Text>
              <Text style={styles.text}>{left > 0 ? `${ils(left)} to go` : 'Reached!'}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>
          </>
        ) : (
          <Text style={styles.strong}>Set your long-term goal ›</Text>
        )}
      </Pressable>
      {editing ? <GoalEditor current={goal} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 6, marginTop: 12, minHeight: 28 },
  pressed: { opacity: 0.75 },
  line: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  strong: { color: '#FFFFFF', fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  text: { color: colors.onDeep, fontFamily: font.body, fontSize: 14 },
  track: { backgroundColor: colors.deepSoft, borderRadius: 2, height: 4, overflow: 'hidden' },
  fill: { backgroundColor: colors.brass, height: 4 },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 43, 36, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  editor: { gap: 12, maxWidth: 420, width: '100%' },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  help: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  problem: { color: colors.down, fontFamily: font.body, fontSize: 14 },
});
