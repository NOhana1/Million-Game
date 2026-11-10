// Under every chart: a note that its dates are the game's own time, and a switch between a line
// and candles. Game time runs faster than real time, so its dates are ahead of the calendar.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';

import type { ChartKind } from './price-chart';
import { colors, font, hover } from './ui';

const KINDS: { value: ChartKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'candles', label: 'Candles' },
];

export function ChartFooter({ kind, onKind }: { kind: ChartKind; onKind: (kind: ChartKind) => void }) {
  const { world } = useGame();
  const speed = world?.clock.speed ?? 7;
  return (
    <View style={styles.row}>
      <Text style={styles.note}>
        Dates are game time
        {speed > 1 ? `: the game clock runs ${speed}× faster than real time` : ''}.
      </Text>
      <View style={styles.kinds}>
        {KINDS.map((option) => {
          const active = option.value === kind;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Show as ${option.label.toLowerCase()}`}
              aria-selected={active}
              onPress={() => onKind(option.value)}
              {...hover('segment')}
              style={[styles.kind, active && styles.kindActive]}>
              <Text style={[styles.kindText, active && styles.kindTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  note: { color: colors.muted, flexShrink: 1, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  kinds: { borderColor: colors.line, borderRadius: 4, borderWidth: 1, flexDirection: 'row', padding: 2 },
  kind: { alignItems: 'center', borderRadius: 3, justifyContent: 'center', minHeight: 30, paddingHorizontal: 12 },
  kindActive: { backgroundColor: colors.brand },
  kindText: { color: colors.muted, fontFamily: font.body, fontSize: 12, fontWeight: '600' },
  kindTextActive: { color: colors.onBrand },
});
