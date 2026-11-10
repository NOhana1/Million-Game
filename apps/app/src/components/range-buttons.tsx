import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Range } from '@/api/client';

import { colors, font, hover } from './ui';

export const RANGE_LABEL: Record<Range, string> = {
  '1D': 'past day',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  ALL: 'all history',
};

export function RangeButtons({
  ranges,
  value,
  onChange,
  enabled = () => true,
}: {
  ranges: readonly Range[];
  value: Range;
  onChange: (range: Range) => void;
  /** A range that would show nothing new, such as 3M for a player who joined last week, is off. */
  enabled?: (range: Range) => boolean;
}) {
  return (
    <View style={styles.ranges}>
      {ranges.map((range) => {
        const active = range === value;
        const on = enabled(range);
        return (
          <Pressable
            key={range}
            accessibilityRole="button"
            accessibilityLabel={`Show ${RANGE_LABEL[range]}`}
            aria-selected={active}
            disabled={!on}
            onPress={() => onChange(range)}
            {...hover('segment')}
            style={[styles.range, active && styles.rangeActive]}>
            <Text style={[styles.rangeText, active && styles.rangeTextActive, !on && styles.rangeTextOff]}>
              {range}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ranges: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', paddingTop: 10 },
  range: { alignItems: 'center', borderRadius: 3, flex: 1, justifyContent: 'center', minHeight: 38 },
  rangeActive: { backgroundColor: colors.brand },
  rangeText: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  rangeTextActive: { color: colors.onBrand },
  rangeTextOff: { opacity: 0.35 },
});
