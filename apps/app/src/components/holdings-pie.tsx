// The portfolio as a ring. Each slice is one circle, drawn as a dash along the same path.

import { Platform, StyleSheet, Text, View } from 'react-native';

import { colors, font, ils } from '@/components/ui';

export type Slice = { id: string; label: string; value: number; color: string; onPress?: () => void };

const SIZE = 232;
const CENTER = SIZE / 2;
const RADIUS = 92;
const RING = 24;
const RING_ACTIVE = 32;
const GAP = 0.7; // the space between slices, in percent of the ring
const SMALLEST = 0.25; // so a tiny holding can still be seen

/** Web only, like the rest of this build. Native would need react-native-svg. */
export function HoldingsPie({
  slices,
  active,
  onActive,
}: {
  slices: Slice[];
  active: string | null;
  onActive: (id: string | null) => void;
}) {
  if (Platform.OS !== 'web') return null;

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const picked = slices.find((slice) => slice.id === active);
  const gap = slices.length > 1 ? GAP : 0;
  let start = 0;

  return (
    <View style={styles.box}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={slices.map((s) => `${s.label} ${share(s.value, total)}`).join(', ')}
        onPointerLeave={() => onActive(null)}>
        {slices.map((slice) => {
          const size = (slice.value / total) * 100;
          const offset = start;
          start += size;
          return (
            <circle
              key={slice.id}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              pathLength={100}
              stroke={slice.color}
              strokeWidth={slice.id === active ? RING_ACTIVE : RING}
              strokeDasharray={`${Math.max(size - gap, SMALLEST)} 100`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              onClick={slice.onPress}
              onPointerEnter={() => onActive(slice.id)}
              style={{
                cursor: slice.onPress ? 'pointer' : 'default',
                opacity: active && slice.id !== active ? 0.35 : 1,
                transition: 'opacity .16s ease, stroke-width .16s ease',
              }}
            />
          );
        })}
      </svg>
      <View pointerEvents="none" style={styles.center}>
        <Text style={styles.label} numberOfLines={2}>
          {picked?.label ?? 'Total'}
        </Text>
        <Text style={styles.value}>{ils(picked?.value ?? total)}</Text>
        {picked ? <Text style={styles.label}>{share(picked.value, total)}</Text> : null}
      </View>
    </View>
  );
}

const share = (value: number, total: number) => `${((value / total) * 100).toFixed(1)}%`;

const styles = StyleSheet.create({
  box: { alignItems: 'center', alignSelf: 'center', height: SIZE, justifyContent: 'center', width: SIZE },
  center: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    maxWidth: RADIUS * 1.5,
    position: 'absolute',
  },
  label: { color: colors.muted, fontFamily: font.body, fontSize: 13, textAlign: 'center' },
  value: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});
